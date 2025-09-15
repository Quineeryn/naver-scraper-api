export function getRandomProxy(): string | undefined {
  const proxies = process.env.PROXIES?.split(",") ?? [];
  const list = proxies.map((p) => p.trim()).filter(Boolean);
  
  if (list.length === 0) return undefined;
  
  return list[Math.floor(Math.random() * list.length)]!;
}