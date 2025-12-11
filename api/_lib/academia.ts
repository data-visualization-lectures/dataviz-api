
export const ACADEMIA_DOMAINS = [
    "@fclt.tamabi.ac.jp",
    "@tamabi.ac.jp",
    "@tcu.ac.jp"
];

export function isAcademiaEmail(email: string): boolean {
    if (!email) return false;
    return ACADEMIA_DOMAINS.some((domain) => email.endsWith(domain));
}
