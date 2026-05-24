using Microsoft.EntityFrameworkCore;
using Samvaad.Common.Caching;
using UserService.Data;
using UserService.Models;

namespace UserService.Services;

public interface IUserService
{
    Task<User?> GetUserByEmailAsync(string email);
    Task<User?> GetUserWithSecurityByIdAsync(Guid id);
    Task<User?> GetUserByIdAsync(Guid id);
    Task<List<User>> SearchUsersAsync(string? query, Guid? excludeUserId);
    Task<User> RegisterUserAsync(RegisterRequest request, string passwordHash);
    Task<User> UpdateUserAsync(Guid userId, UpdateProfileRequest request);
    Task<User> UpdateAvatarAsync(Guid userId, string? profilePictureUrl);
    Task<User> UpdateStatusAsync(Guid userId, string status);
    Task<bool> UserExistsAsync(string email);
    Task SaveUserSecurityAsync(User user);
    Task InvalidateUserCachesAsync(User user);
}

public class UserServiceImpl : IUserService
{
    private static readonly TimeSpan UserProfileTtl = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan UserSearchTtl = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan UserExistsTtl = TimeSpan.FromMinutes(10);

    private readonly UserDbContext _context;
    private readonly IAppCache _cache;

    public UserServiceImpl(UserDbContext context, IAppCache cache)
    {
        _context = context;
        _cache = cache;
    }

    public async Task<User?> GetUserByEmailAsync(string email)
    {
        // Login needs the password hash, so this lookup intentionally stays uncached.
        return await _context.Users.FirstOrDefaultAsync(u => u.Email == email);
    }

    public async Task<User?> GetUserWithSecurityByIdAsync(Guid id)
    {
        return await _context.Users.FirstOrDefaultAsync(u => u.Id == id);
    }

    public async Task<User?> GetUserByIdAsync(Guid id)
    {
        return await _cache.GetOrCreateAsync(
            UserByIdKey(id),
            async _ => await _context.Users
                .Where(u => u.Id == id)
                .Select(user => new User
                {
                    Id = user.Id,
                    Email = user.Email,
                    FirstName = user.FirstName,
                    LastName = user.LastName,
                    PhoneNumber = user.PhoneNumber,
                    ProfilePictureUrl = user.ProfilePictureUrl,
                    Status = user.Status,
                    MfaEnabled = user.MfaEnabled,
                    IsActive = user.IsActive,
                    IsEmailVerified = user.IsEmailVerified,
                    CreatedAt = user.CreatedAt,
                    UpdatedAt = user.UpdatedAt,
                    PasswordHash = string.Empty
                })
                .FirstOrDefaultAsync(),
            UserProfileTtl);
    }

    public async Task<List<User>> SearchUsersAsync(string? query, Guid? excludeUserId)
    {
        var version = await GetUserCacheVersionAsync();
        var normalizedQuery = string.IsNullOrWhiteSpace(query) ? "all" : CacheKey.Hash(query);
        var cacheKey = $"users:search:v{version}:exclude-{excludeUserId?.ToString("N") ?? "none"}:q-{normalizedQuery}";

        return await _cache.GetOrCreateAsync(cacheKey, async _ =>
        {
            var users = _context.Users.Where(user => user.IsActive);

            if (excludeUserId.HasValue)
            {
                users = users.Where(user => user.Id != excludeUserId.Value);
            }

            if (!string.IsNullOrWhiteSpace(query))
            {
                var normalized = query.Trim().ToLower();
                users = users.Where(user =>
                    user.Email.ToLower().Contains(normalized) ||
                    user.FirstName.ToLower().Contains(normalized) ||
                    user.LastName.ToLower().Contains(normalized));
            }

            return await users
                .OrderBy(user => user.FirstName)
                .ThenBy(user => user.LastName)
                .Select(user => new User
                {
                    Id = user.Id,
                    Email = user.Email,
                    FirstName = user.FirstName,
                    LastName = user.LastName,
                    PhoneNumber = user.PhoneNumber,
                    ProfilePictureUrl = user.ProfilePictureUrl,
                    Status = user.Status,
                    MfaEnabled = user.MfaEnabled,
                    IsActive = user.IsActive,
                    IsEmailVerified = user.IsEmailVerified,
                    CreatedAt = user.CreatedAt,
                    UpdatedAt = user.UpdatedAt,
                    PasswordHash = string.Empty
                })
                .Take(25)
                .ToListAsync();
        }, UserSearchTtl);
    }

    public async Task<User> RegisterUserAsync(RegisterRequest request, string passwordHash)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = request.Email,
            FirstName = request.FirstName,
            LastName = request.LastName,
            PasswordHash = passwordHash,
            IsEmailVerified = false,
            Status = UserPresenceStatuses.Available,
            CreatedAt = DateTime.UtcNow
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();
        await InvalidateUserCachesAsync(user);
        return user;
    }

    public async Task<User> UpdateUserAsync(Guid userId, UpdateProfileRequest request)
    {
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
            throw new InvalidOperationException("User not found");

        user.FirstName = request.FirstName;
        user.LastName = request.LastName;
        user.PhoneNumber = request.PhoneNumber;
        user.ProfilePictureUrl = request.ProfilePictureUrl;
        user.UpdatedAt = DateTime.UtcNow;

        _context.Users.Update(user);
        await _context.SaveChangesAsync();
        await InvalidateUserCachesAsync(user);
        return user;
    }

    public async Task<User> UpdateAvatarAsync(Guid userId, string? profilePictureUrl)
    {
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
            throw new InvalidOperationException("User not found");

        user.ProfilePictureUrl = profilePictureUrl;
        user.UpdatedAt = DateTime.UtcNow;

        _context.Users.Update(user);
        await _context.SaveChangesAsync();
        await InvalidateUserCachesAsync(user);
        return user;
    }

    public async Task<User> UpdateStatusAsync(Guid userId, string status)
    {
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
            throw new InvalidOperationException("User not found");

        user.Status = UserPresenceStatuses.Normalize(status);
        user.UpdatedAt = DateTime.UtcNow;

        _context.Users.Update(user);
        await _context.SaveChangesAsync();
        await InvalidateUserCachesAsync(user);
        return user;
    }

    public async Task<bool> UserExistsAsync(string email)
    {
        var normalized = NormalizeEmail(email);
        return await _cache.GetOrCreateAsync(
            $"users:exists:{CacheKey.Hash(normalized)}",
            async _ => await _context.Users.AnyAsync(u => u.Email.ToLower() == normalized),
            UserExistsTtl);
    }

    public async Task SaveUserSecurityAsync(User user)
    {
        user.UpdatedAt = DateTime.UtcNow;
        _context.Users.Update(user);
        await _context.SaveChangesAsync();
        await InvalidateUserCachesAsync(user);
    }

    private async Task<long> GetUserCacheVersionAsync()
    {
        return await _cache.GetOrCreateAsync("users:version", _ => Task.FromResult(1L), TimeSpan.FromDays(30));
    }

    public async Task InvalidateUserCachesAsync(User user)
    {
        await _cache.RemoveAsync(new[]
        {
            UserByIdKey(user.Id),
            $"users:exists:{CacheKey.Hash(NormalizeEmail(user.Email))}"
        });

        await _cache.IncrementAsync("users:version", TimeSpan.FromDays(30));
    }

    private static string UserByIdKey(Guid id)
    {
        return $"users:profile:{id:N}";
    }

    private static string NormalizeEmail(string email)
    {
        return email.Trim().ToLowerInvariant();
    }
}
