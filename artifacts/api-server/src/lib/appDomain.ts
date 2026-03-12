export function getAppBaseUrl(): string {
  const domain = process.env.APP_DOMAIN;
  if (!domain) {
    return "http://localhost:3000";
  }
  const protocol = domain.startsWith("localhost") || domain.startsWith("127.") ? "http" : "https";
  return `${protocol}://${domain}`;
}
