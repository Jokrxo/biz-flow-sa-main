import { useEffect } from "react";

interface SEOProps {
  title: string;
  description?: string;
  canonical?: string;
}

export default function SEO({ title, description, canonical }: SEOProps) {
  useEffect(() => {
    document.title = title;

    const metaDesc = document.querySelector('meta[name="description"]') || document.createElement("meta");
    metaDesc.setAttribute("name", "description");
    if (description) metaDesc.setAttribute("content", description);
    if (!metaDesc.parentNode) document.head.appendChild(metaDesc);

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    if (canonical) link.setAttribute("href", canonical);
  }, [title, description, canonical]);
  return null;
}
