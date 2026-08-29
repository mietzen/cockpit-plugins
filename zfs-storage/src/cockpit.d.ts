declare namespace cockpit {
  interface SpawnOptions {
    superuser?: "require" | "try";
    err?: "out" | "ignore" | "message";
    environ?: string[];
  }

  interface SpawnPromise extends Promise<string> {
    stream(callback: (data: string) => void): SpawnPromise;
    input(data: string, stream?: boolean): SpawnPromise;
    close(): void;
  }

  function spawn(args: string[], options?: SpawnOptions): SpawnPromise;
  function format_bytes(bytes: number): string;
  function format_bytes_per_sec(bytes: number): string;
  
  const location: {
    go(path: string): void;
    href: string;
  };
}

interface Window {
  cockpit: typeof cockpit;
}
