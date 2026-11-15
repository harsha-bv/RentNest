const reservedDomains = ["example.com", "example.net", "example.org"];
const reservedTopLevelDomains = new Set(["example", "invalid", "localhost", "local", "test"]);

export function isAllowedEmailAddress(value) {
  if (typeof value !== "string") return false;
  const email = value.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;

  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  const labels = domain.split(".");
  if (labels.some((label) => (
    label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ))) return false;

  const topLevelDomain = domain.slice(domain.lastIndexOf(".") + 1);
  return !reservedTopLevelDomains.has(topLevelDomain)
    && !reservedDomains.some((reserved) => domain === reserved || domain.endsWith(`.${reserved}`));
}
