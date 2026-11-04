import { useEffect, useState, type ComponentType } from "react";

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;

const modules = import.meta.glob("./mockups/**/*.tsx") as ModuleMap;

function resolveComponent(
  mod: Record<string, unknown>,
  name: string,
): ComponentType | undefined {
  const functions = Object.values(mod).filter(
    (value) => typeof value === "function",
  ) as ComponentType[];
  return (
    (mod.default as ComponentType) ||
    (mod.Preview as ComponentType) ||
    (mod[name] as ComponentType) ||
    functions[functions.length - 1]
  );
}

function PreviewRenderer({
  componentPath,
}: {
  componentPath: string;
}) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setComponent(null);
    setError(null);

    async function loadComponent() {
      const loader = modules[`./mockups/${componentPath}.tsx`];
      if (!loader) {
        setError(`No component found at ${componentPath}.tsx`);
        return;
      }

      try {
        const mod = await loader();
        if (cancelled) return;
        const name = componentPath.split("/").pop()!;
        const component = resolveComponent(mod, name);
        if (!component) {
          setError(`No exported React component found in ${componentPath}.tsx`);
          return;
        }
        setComponent(() => component);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    }

    void loadComponent();
    return () => {
      cancelled = true;
    };
  }, [componentPath]);

  if (error) {
    return <pre className="p-8 text-destructive">{error}</pre>;
  }
  if (!Component) return null;
  return <Component />;
}

function App() {
  const [path, setPath] = useState(() =>
    window.location.hash.replace(/^#\/?/, "").replace(/\/$/, ""),
  );

  useEffect(() => {
    const handleHashChange = () =>
      setPath(window.location.hash.replace(/^#\/?/, "").replace(/\/$/, ""));
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return path ? (
    <PreviewRenderer componentPath={path} />
  ) : (
    <main className="grid min-h-screen place-items-center bg-background p-8 text-foreground">
      <p className="text-muted-foreground">Program Editorial preview entry</p>
    </main>
  );
}

export default App;
