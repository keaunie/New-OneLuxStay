import { useEffect } from "react";

const SUFFIX = "OneLuxStay Redondo Beach";

// Sets the browser tab title and meta description for the current page.
export default function usePageMeta(title, description) {
  useEffect(() => {
    document.title = title ? `${title} | ${SUFFIX}` : "Furnished Monthly Rentals in Redondo Beach, CA | OneLuxStay";
    if (description) {
      let tag = document.querySelector('meta[name="description"]');
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", "description");
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", description);
    }
  }, [title, description]);
}
