using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using UserService.Models;

namespace UserService.Services;

public interface IMfaService
{
    string GenerateSecret();
    string ProtectSecret(string secret);
    string UnprotectSecret(string protectedSecret);
    string BuildOtpAuthUri(User user, string secret);
    string GenerateCurrentTotpCode(string secret);
    bool VerifyTotpCode(string secret, string code);
    string CreateLoginChallengeToken(User user);
    Guid? ValidateLoginChallengeToken(string token);
    List<string> GenerateRecoveryCodes(int count = 8);
    string HashRecoveryCode(Guid userId, string code);
    bool TryUseRecoveryCode(User user, string code);
    bool VerifyUserCode(User user, string code);
    string IssueRememberDeviceToken(User user);
    bool IsRememberDeviceValid(User user, string? token);
}

public class MfaService : IMfaService
{
    private const int SecretByteLength = 20;
    private const int TotpPeriodSeconds = 30;
    private const int TotpDigits = 6;
    private static readonly char[] Base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".ToCharArray();
    private static readonly char[] RecoveryCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray();

    private readonly IDataProtector _protector;
    private readonly IConfiguration _configuration;

    public MfaService(IDataProtectionProvider dataProtectionProvider, IConfiguration configuration)
    {
        _protector = dataProtectionProvider.CreateProtector("Samvaad.UserService.Mfa");
        _configuration = configuration;
    }

    public string GenerateSecret()
    {
        var bytes = RandomNumberGenerator.GetBytes(SecretByteLength);
        return Base32Encode(bytes);
    }

    public string ProtectSecret(string secret)
    {
        return _protector.Protect(secret);
    }

    public string UnprotectSecret(string protectedSecret)
    {
        return _protector.Unprotect(protectedSecret);
    }

    public string BuildOtpAuthUri(User user, string secret)
    {
        var issuer = _configuration["Mfa:Issuer"] ?? "Samvaad";
        var label = $"{issuer}:{user.Email}";

        return "otpauth://totp/"
            + WebUtility.UrlEncode(label)
            + "?secret="
            + WebUtility.UrlEncode(secret)
            + "&issuer="
            + WebUtility.UrlEncode(issuer)
            + "&digits=6&period=30";
    }

    public string GenerateCurrentTotpCode(string secret)
    {
        return GenerateTotpCode(secret, DateTimeOffset.UtcNow);
    }

    public bool VerifyTotpCode(string secret, string code)
    {
        var normalizedCode = NormalizeTotpCode(code);
        if (normalizedCode.Length != TotpDigits)
        {
            return false;
        }

        var now = DateTimeOffset.UtcNow;
        for (var window = -1; window <= 1; window++)
        {
            var candidate = GenerateTotpCode(secret, now.AddSeconds(window * TotpPeriodSeconds));
            if (FixedTimeEquals(candidate, normalizedCode))
            {
                return true;
            }
        }

        return false;
    }

    public string CreateLoginChallengeToken(User user)
    {
        var challengeMinutes = _configuration.GetValue("Mfa:ChallengeMinutes", 5);
        var expiresAt = DateTimeOffset.UtcNow.AddMinutes(Math.Clamp(challengeMinutes, 1, 30));
        var payload = $"{user.Id:N}|{expiresAt:O}|{Guid.NewGuid():N}";
        return Base64UrlEncode(Encoding.UTF8.GetBytes(_protector.Protect(payload)));
    }

    public Guid? ValidateLoginChallengeToken(string token)
    {
        try
        {
            var protectedPayload = Encoding.UTF8.GetString(Base64UrlDecode(token));
            var payload = _protector.Unprotect(protectedPayload);
            var parts = payload.Split('|', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length < 2 || !Guid.TryParse(parts[0], out var userId))
            {
                return null;
            }

            if (!DateTimeOffset.TryParse(parts[1], CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var expiresAt))
            {
                return null;
            }

            return expiresAt >= DateTimeOffset.UtcNow ? userId : null;
        }
        catch
        {
            return null;
        }
    }

    public List<string> GenerateRecoveryCodes(int count = 8)
    {
        return Enumerable.Range(0, count)
            .Select(_ => $"{RandomRecoverySegment()}-{RandomRecoverySegment()}")
            .ToList();
    }

    public string HashRecoveryCode(Guid userId, string code)
    {
        var normalized = NormalizeRecoveryCode(code);
        return HashToken($"{userId:N}:recovery:{normalized}");
    }

    public bool TryUseRecoveryCode(User user, string code)
    {
        var normalized = NormalizeRecoveryCode(code);
        if (string.IsNullOrWhiteSpace(normalized) || string.IsNullOrWhiteSpace(user.MfaRecoveryCodeHashes))
        {
            return false;
        }

        var targetHash = HashRecoveryCode(user.Id, normalized);
        var hashes = user.MfaRecoveryCodeHashes
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();

        var index = hashes.FindIndex(hash => FixedTimeEquals(hash, targetHash));
        if (index < 0)
        {
            return false;
        }

        hashes.RemoveAt(index);
        user.MfaRecoveryCodeHashes = hashes.Count == 0 ? null : string.Join(';', hashes);
        return true;
    }

    public bool VerifyUserCode(User user, string code)
    {
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(user.MfaSecretProtected))
        {
            return false;
        }

        var secret = UnprotectSecret(user.MfaSecretProtected);
        return VerifyTotpCode(secret, code) || TryUseRecoveryCode(user, code);
    }

    public string IssueRememberDeviceToken(User user)
    {
        var rememberDays = _configuration.GetValue("Mfa:RememberDeviceDays", 30);
        var token = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        user.MfaRememberDeviceTokenHash = HashRememberDeviceToken(user.Id, token);
        user.MfaRememberDeviceExpiresAt = DateTime.UtcNow.AddDays(Math.Clamp(rememberDays, 1, 365));
        return token;
    }

    public bool IsRememberDeviceValid(User user, string? token)
    {
        if (string.IsNullOrWhiteSpace(token)
            || string.IsNullOrWhiteSpace(user.MfaRememberDeviceTokenHash)
            || user.MfaRememberDeviceExpiresAt == null
            || user.MfaRememberDeviceExpiresAt <= DateTime.UtcNow)
        {
            return false;
        }

        var candidateHash = HashRememberDeviceToken(user.Id, token);
        return FixedTimeEquals(user.MfaRememberDeviceTokenHash, candidateHash);
    }

    private static string GenerateTotpCode(string secret, DateTimeOffset timestamp)
    {
        var key = Base32Decode(secret);
        var counter = timestamp.ToUnixTimeSeconds() / TotpPeriodSeconds;
        var counterBytes = BitConverter.GetBytes(IPAddress.HostToNetworkOrder(counter));

        using var hmac = new HMACSHA1(key);
        var hash = hmac.ComputeHash(counterBytes);
        var offset = hash[^1] & 0x0f;
        var binary =
            ((hash[offset] & 0x7f) << 24)
            | ((hash[offset + 1] & 0xff) << 16)
            | ((hash[offset + 2] & 0xff) << 8)
            | (hash[offset + 3] & 0xff);

        var otp = binary % (int)Math.Pow(10, TotpDigits);
        return otp.ToString($"D{TotpDigits}", CultureInfo.InvariantCulture);
    }

    private static string RandomRecoverySegment()
    {
        Span<char> buffer = stackalloc char[4];
        for (var i = 0; i < buffer.Length; i++)
        {
            buffer[i] = RecoveryCodeAlphabet[RandomNumberGenerator.GetInt32(RecoveryCodeAlphabet.Length)];
        }

        return new string(buffer);
    }

    private static string NormalizeTotpCode(string code)
    {
        return new string(code.Where(char.IsDigit).ToArray());
    }

    private static string NormalizeRecoveryCode(string code)
    {
        return new string(code
            .Where(char.IsLetterOrDigit)
            .Select(char.ToUpperInvariant)
            .ToArray());
    }

    private static string HashRememberDeviceToken(Guid userId, string token)
    {
        return HashToken($"{userId:N}:remember:{token}");
    }

    private static string HashToken(string token)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    private static bool FixedTimeEquals(string left, string right)
    {
        var leftBytes = Encoding.UTF8.GetBytes(left);
        var rightBytes = Encoding.UTF8.GetBytes(right);
        return leftBytes.Length == rightBytes.Length
            && CryptographicOperations.FixedTimeEquals(leftBytes, rightBytes);
    }

    private static string Base32Encode(byte[] bytes)
    {
        var output = new StringBuilder((bytes.Length + 4) / 5 * 8);
        var bitBuffer = 0;
        var bitCount = 0;

        foreach (var value in bytes)
        {
            bitBuffer = (bitBuffer << 8) | value;
            bitCount += 8;

            while (bitCount >= 5)
            {
                output.Append(Base32Alphabet[(bitBuffer >> (bitCount - 5)) & 31]);
                bitCount -= 5;
            }
        }

        if (bitCount > 0)
        {
            output.Append(Base32Alphabet[(bitBuffer << (5 - bitCount)) & 31]);
        }

        return output.ToString();
    }

    private static byte[] Base32Decode(string input)
    {
        var normalized = input.Trim().TrimEnd('=').ToUpperInvariant();
        var output = new List<byte>();
        var bitBuffer = 0;
        var bitCount = 0;

        foreach (var character in normalized)
        {
            var value = Array.IndexOf(Base32Alphabet, character);
            if (value < 0)
            {
                throw new FormatException("Invalid base32 secret.");
            }

            bitBuffer = (bitBuffer << 5) | value;
            bitCount += 5;

            if (bitCount >= 8)
            {
                output.Add((byte)((bitBuffer >> (bitCount - 8)) & 0xff));
                bitCount -= 8;
            }
        }

        return output.ToArray();
    }

    private static string Base64UrlEncode(byte[] bytes)
    {
        return Convert.ToBase64String(bytes)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static byte[] Base64UrlDecode(string value)
    {
        var incoming = value.Replace('-', '+').Replace('_', '/');
        var padding = incoming.Length % 4;
        if (padding > 0)
        {
            incoming = incoming.PadRight(incoming.Length + 4 - padding, '=');
        }

        return Convert.FromBase64String(incoming);
    }
}
