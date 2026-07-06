export function getGreeting(): { greeting: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 12) return { greeting: "Good morning", emoji: "\u2600\uFE0F" };
  if (h < 17) return { greeting: "Good afternoon", emoji: "\uD83C\uDF3F" };
  return { greeting: "Good evening", emoji: "\uD83C\uDF19" };
}
