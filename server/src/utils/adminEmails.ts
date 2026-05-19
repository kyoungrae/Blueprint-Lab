export function getAdminEmails(): string[] {
    return (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
}

export function isAdminEmail(email: string | undefined | null): boolean {
    const normalized = (email || '').toLowerCase();
    if (!normalized) return false;
    const adminEmails = getAdminEmails();
    return adminEmails.length > 0 && adminEmails.includes(normalized);
}
