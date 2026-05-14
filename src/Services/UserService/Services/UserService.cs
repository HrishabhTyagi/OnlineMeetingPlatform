using Microsoft.EntityFrameworkCore;
using UserService.Data;
using UserService.Models;

namespace UserService.Services;

public interface IUserService
{
    Task<User?> GetUserByEmailAsync(string email);
    Task<User?> GetUserByIdAsync(Guid id);
    Task<List<User>> SearchUsersAsync(string? query, Guid? excludeUserId);
    Task<User> RegisterUserAsync(RegisterRequest request, string passwordHash);
    Task<User> UpdateUserAsync(Guid userId, UpdateProfileRequest request);
    Task<User> UpdateStatusAsync(Guid userId, string status);
    Task<bool> UserExistsAsync(string email);
}

public class UserServiceImpl : IUserService
{
    private readonly UserDbContext _context;

    public UserServiceImpl(UserDbContext context)
    {
        _context = context;
    }

    public async Task<User?> GetUserByEmailAsync(string email)
    {
        return await _context.Users.FirstOrDefaultAsync(u => u.Email == email);
    }

    public async Task<User?> GetUserByIdAsync(Guid id)
    {
        return await _context.Users.FirstOrDefaultAsync(u => u.Id == id);
    }

    public async Task<List<User>> SearchUsersAsync(string? query, Guid? excludeUserId)
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
            .Take(25)
            .ToListAsync();
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
        return user;
    }

    public async Task<bool> UserExistsAsync(string email)
    {
        return await _context.Users.AnyAsync(u => u.Email == email);
    }
}
