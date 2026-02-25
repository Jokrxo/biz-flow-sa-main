// Global, runtime-configurable API URL.
// For deployment, set on the hosting page before the bundle loads:
// <script>window.__ENV__ = { API_BASE_URL: "https://your-ec2-domain.com" };</script>
// When not set, it will use relative URLs (e.g., /api/...)
export const API_BASE_URL: string = (window as any)?.__ENV__?.API_BASE_URL || "";
