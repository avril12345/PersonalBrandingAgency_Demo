import * as React from "react";

// Hash routes ("#/operators") so the site works from any static host
// without server rewrites.
function current() {
  return window.location.hash.replace(/^#/, "") || "/";
}

export function useRoute() {
  const [route, setRoute] = React.useState(current);
  React.useEffect(() => {
    const onChange = () => {
      setRoute(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
