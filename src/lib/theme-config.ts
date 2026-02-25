export type ThemeKey = "original" | "corp_blue" | "fintech_green" | "premium_navy" | "neutral_enterprise" | "dark_pro" | "exec_gold" | "ocean_gradient" | "purple_digital" | "tech_silver" | "eco_green";

export const themes: Array<{ key: ThemeKey; name: string; className: string; description: string; colors: string[] }> = [
  { key: "original", name: "Original SA Finance", className: "", description: "Professional SA finance palette", colors: ["#2563eb", "#f8fafc"] },
  { key: "corp_blue", name: "Corporate Blue", className: "theme-corp-blue", description: "Deep blue, white, slate grey", colors: ["#1e40af", "#f1f5f9"] },
  { key: "fintech_green", name: "Fintech Green", className: "theme-fintech-green", description: "Teal/green with soft neutrals", colors: ["#0d9488", "#f0fdfa"] },
  { key: "premium_navy", name: "Premium Navy", className: "theme-premium-navy", description: "Dark navy with glowing teal", colors: ["#0f172a", "#2dd4bf"] },
  { key: "neutral_enterprise", name: "Neutral Enterprise", className: "theme-neutral-enterprise", description: "Calm grey and white", colors: ["#475569", "#f8fafc"] },
  { key: "dark_pro", name: "Dark Mode Pro", className: "theme-dark-pro", description: "Charcoal with electric blue", colors: ["#18181b", "#3b82f6"] },
  { key: "exec_gold", name: "Executive Gold", className: "theme-exec-gold", description: "Luxury black + gold highlights", colors: ["#000000", "#eab308"] },
  { key: "ocean_gradient", name: "Ocean Gradient", className: "theme-ocean-gradient", description: "Soft teal to blue gradients", colors: ["#0ea5e9", "#e0f2fe"] },
  { key: "purple_digital", name: "Purple Digital", className: "theme-purple-digital", description: "Purple/indigo with neon accents", colors: ["#7c3aed", "#faf5ff"] },
  { key: "tech_silver", name: "Tech Silver", className: "theme-tech-silver", description: "Frosted glass silver/blue", colors: ["#94a3b8", "#f1f5f9"] },
  { key: "eco_green", name: "Eco Green", className: "theme-eco-green", description: "Soft green with brown undertones", colors: ["#166534", "#f0fdf4"] },
];

export const applyTheme = (key: ThemeKey) => {
  const html = document.documentElement;
  themes.forEach(t => t.className && html.classList.remove(t.className));
  const t = themes.find(t => t.key === key);
  if (t && t.className) html.classList.add(t.className);
  
  const isDarkFamily = key === "dark_pro" || key === "premium_navy" || key === "purple_digital" || key === "exec_gold";
  if (isDarkFamily) html.classList.add('dark'); else html.classList.remove('dark');
  
  localStorage.setItem("app_theme", key);
};
