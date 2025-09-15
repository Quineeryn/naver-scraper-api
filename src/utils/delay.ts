export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function randomDelay(minMs = 100, maxMs = 400) {
const jitter = Math.random() * (maxMs - minMs) + minMs;
return sleep(jitter);
}