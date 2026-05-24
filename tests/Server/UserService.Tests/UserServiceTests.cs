using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Samvaad.Common.Caching;
using UserService.Controllers;
using UserService.Data;
using UserService.Models;
using UserService.Services;

namespace UserService.Tests;

public class UserServiceTests
{
    private static UserDbContext CreateDbContext()
    {
        var options = new DbContextOptionsBuilder<UserDbContext>()
            .UseInMemoryDatabase($"user-tests-{Guid.NewGuid():N}")
            .Options;
        return new UserDbContext(options);
    }

    private static AuthService CreateAuthService()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["JwtSettings:SecretKey"] = "test-secret-key-that-is-long-enough-for-hmac-sha256",
                ["JwtSettings:Issuer"] = "samvaad-tests",
                ["JwtSettings:Audience"] = "samvaad-client-tests",
                ["JwtSettings:ExpirationHours"] = "2"
            })
            .Build();
        return new AuthService(configuration);
    }

    private static MfaService CreateMfaService()
    {
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Mfa:Issuer"] = "Samvaad Tests",
                ["Mfa:ChallengeMinutes"] = "5",
                ["Mfa:RememberDeviceDays"] = "30"
            })
            .Build();
        var keyDirectory = Directory.CreateDirectory(Path.Combine(Path.GetTempPath(), $"samvaad-mfa-tests-{Guid.NewGuid():N}"));
        return new MfaService(DataProtectionProvider.Create(keyDirectory), configuration);
    }

    [Fact]
    public void AuthService_hashes_verifies_and_generates_expected_jwt_claims()
    {
        var auth = CreateAuthService();
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = "asha@samvaad.test",
            FirstName = "Asha",
            LastName = "Mehta",
            PasswordHash = "unused"
        };

        var hash = auth.HashPassword("Password123!");
        var token = auth.GenerateJwtToken(user);
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(token);

        Assert.True(auth.VerifyPassword("Password123!", hash));
        Assert.False(auth.VerifyPassword("wrong", hash));
        Assert.Contains(jwt.Claims, claim => claim.Value == user.Email);
        Assert.Contains(jwt.Claims, claim => claim.Value == user.Id.ToString());
        Assert.Equal("samvaad-tests", jwt.Issuer);
    }

    [Fact]
    public async Task UserService_registers_searches_updates_profile_avatar_and_status()
    {
        await using var db = CreateDbContext();
        var service = new UserServiceImpl(db, new NoOpAppCache());
        var asha = await service.RegisterUserAsync(new RegisterRequest
        {
            Email = "asha@samvaad.test",
            FirstName = "Asha",
            LastName = "Mehta",
            Password = "Password123!"
        }, "hash");
        await service.RegisterUserAsync(new RegisterRequest
        {
            Email = "alex@samvaad.test",
            FirstName = "Alex",
            LastName = "Benton",
            Password = "Password123!"
        }, "hash");

        var search = await service.SearchUsersAsync("ash", excludeUserId: null);
        Assert.Single(search);
        Assert.Equal(asha.Id, search[0].Id);

        var excluded = await service.SearchUsersAsync(null, asha.Id);
        Assert.DoesNotContain(excluded, user => user.Id == asha.Id);

        var updated = await service.UpdateUserAsync(asha.Id, new UpdateProfileRequest
        {
            FirstName = "Asha",
            LastName = "Singh",
            PhoneNumber = "12345",
            ProfilePictureUrl = "/avatar.png"
        });
        Assert.Equal("Singh", updated.LastName);

        var avatar = await service.UpdateAvatarAsync(asha.Id, "/user-avatars/asha.png");
        Assert.Equal("/user-avatars/asha.png", avatar.ProfilePictureUrl);

        var status = await service.UpdateStatusAsync(asha.Id, "presenting");
        Assert.Equal(UserPresenceStatuses.Available, status.Status);
        status = await service.UpdateStatusAsync(asha.Id, "busy");
        Assert.Equal(UserPresenceStatuses.Busy, status.Status);
    }

    [Fact]
    public async Task AuthController_register_and_login_return_tokens_and_reject_duplicates_or_bad_passwords()
    {
        await using var db = CreateDbContext();
        var userService = new UserServiceImpl(db, new NoOpAppCache());
        var authService = CreateAuthService();
        var controller = new AuthController(userService, authService, CreateMfaService(), NullLogger<AuthController>.Instance);

        var registerResult = await controller.Register(new RegisterRequest
        {
            Email = "asha@samvaad.test",
            FirstName = "Asha",
            LastName = "Mehta",
            Password = "Password123!"
        });
        var ok = Assert.IsType<OkObjectResult>(registerResult.Result);
        var registered = Assert.IsType<LoginResponse>(ok.Value);
        Assert.False(string.IsNullOrWhiteSpace(registered.Token));

        var duplicate = await controller.Register(new RegisterRequest
        {
            Email = "asha@samvaad.test",
            Password = "Password123!"
        });
        Assert.IsType<BadRequestObjectResult>(duplicate.Result);

        var login = await controller.Login(new LoginRequest
        {
            Email = "asha@samvaad.test",
            Password = "Password123!"
        });
        Assert.IsType<OkObjectResult>(login.Result);

        var badLogin = await controller.Login(new LoginRequest
        {
            Email = "asha@samvaad.test",
            Password = "wrong"
        });
        Assert.IsType<UnauthorizedObjectResult>(badLogin.Result);
    }

    [Fact]
    public async Task AuthController_requires_mfa_then_accepts_authenticator_code_and_remembered_device()
    {
        await using var db = CreateDbContext();
        var userService = new UserServiceImpl(db, new NoOpAppCache());
        var authService = CreateAuthService();
        var mfaService = CreateMfaService();
        var controller = new AuthController(userService, authService, mfaService, NullLogger<AuthController>.Instance);

        var user = await userService.RegisterUserAsync(new RegisterRequest
        {
            Email = "mfa@samvaad.test",
            FirstName = "Mfa",
            LastName = "User",
            Password = "Password123!"
        }, authService.HashPassword("Password123!"));

        var secret = mfaService.GenerateSecret();
        user.MfaEnabled = true;
        user.MfaEnabledAt = DateTime.UtcNow;
        user.MfaSecretProtected = mfaService.ProtectSecret(secret);
        var recoveryCodes = mfaService.GenerateRecoveryCodes(1);
        user.MfaRecoveryCodeHashes = string.Join(';', recoveryCodes.Select(code => mfaService.HashRecoveryCode(user.Id, code)));
        await userService.SaveUserSecurityAsync(user);

        var firstLogin = await controller.Login(new LoginRequest
        {
            Email = "mfa@samvaad.test",
            Password = "Password123!"
        });
        var challengeResult = Assert.IsType<OkObjectResult>(firstLogin.Result);
        var challenge = Assert.IsType<LoginResponse>(challengeResult.Value);
        Assert.True(challenge.RequiresMfa);
        Assert.NotNull(challenge.MfaToken);
        Assert.True(string.IsNullOrWhiteSpace(challenge.Token));

        var verify = await controller.VerifyMfaLogin(new VerifyMfaLoginRequest
        {
            MfaToken = challenge.MfaToken!,
            Code = mfaService.GenerateCurrentTotpCode(secret),
            RememberDevice = true
        });
        var verifyOk = Assert.IsType<OkObjectResult>(verify.Result);
        var verified = Assert.IsType<LoginResponse>(verifyOk.Value);
        Assert.False(string.IsNullOrWhiteSpace(verified.Token));
        Assert.False(string.IsNullOrWhiteSpace(verified.RememberDeviceToken));

        var rememberedLogin = await controller.Login(new LoginRequest
        {
            Email = "mfa@samvaad.test",
            Password = "Password123!",
            RememberDeviceToken = verified.RememberDeviceToken
        });
        var rememberedOk = Assert.IsType<OkObjectResult>(rememberedLogin.Result);
        var remembered = Assert.IsType<LoginResponse>(rememberedOk.Value);
        Assert.False(remembered.RequiresMfa);
        Assert.False(string.IsNullOrWhiteSpace(remembered.Token));
    }

    [Fact]
    public async Task UserService_caches_read_models_and_invalidates_after_writes()
    {
        await using var db = CreateDbContext();
        var cache = new TestAppCache();
        var service = new UserServiceImpl(db, cache);

        var asha = await service.RegisterUserAsync(new RegisterRequest
        {
            Email = "asha@samvaad.test",
            FirstName = "Asha",
            LastName = "Mehta",
            Password = "Password123!"
        }, "hash");

        var firstProfile = await service.GetUserByIdAsync(asha.Id);
        Assert.NotNull(firstProfile);
        Assert.Equal("Mehta", firstProfile.LastName);

        await service.UpdateUserAsync(asha.Id, new UpdateProfileRequest
        {
            FirstName = "Asha",
            LastName = "Singh"
        });

        var refreshedProfile = await service.GetUserByIdAsync(asha.Id);
        Assert.NotNull(refreshedProfile);
        Assert.Equal("Singh", refreshedProfile.LastName);

        var firstSearch = await service.SearchUsersAsync("ash", null);
        Assert.Single(firstSearch);

        await service.RegisterUserAsync(new RegisterRequest
        {
            Email = "ashwin@samvaad.test",
            FirstName = "Ashwin",
            LastName = "Rao",
            Password = "Password123!"
        }, "hash");

        var refreshedSearch = await service.SearchUsersAsync("ash", null);
        Assert.Equal(2, refreshedSearch.Count);
        Assert.True(cache.SetCount > 0);
        Assert.True(cache.IncrementCount > 0);
    }

    private sealed class TestAppCache : IAppCache
    {
        private readonly Dictionary<string, object?> _values = new(StringComparer.Ordinal);

        public int SetCount { get; private set; }
        public int IncrementCount { get; private set; }

        public Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default)
        {
            return Task.FromResult(_values.TryGetValue(key, out var value) ? (T?)value : default);
        }

        public Task SetAsync<T>(string key, T value, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
        {
            SetCount++;
            _values[key] = value;
            return Task.CompletedTask;
        }

        public Task RemoveAsync(IEnumerable<string> keys, CancellationToken cancellationToken = default)
        {
            foreach (var key in keys)
            {
                _values.Remove(key);
            }

            return Task.CompletedTask;
        }

        public Task<long> IncrementAsync(string key, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
        {
            IncrementCount++;
            var current = _values.TryGetValue(key, out var value) && value is long version ? version : 0;
            _values[key] = current + 1;
            return Task.FromResult(current + 1);
        }

        public async Task<T> GetOrCreateAsync<T>(string key, Func<CancellationToken, Task<T>> factory, TimeSpan? ttl = null, CancellationToken cancellationToken = default)
        {
            if (_values.TryGetValue(key, out var value))
            {
                return (T)value!;
            }

            var created = await factory(cancellationToken);
            _values[key] = created;
            SetCount++;
            return created;
        }
    }
}
