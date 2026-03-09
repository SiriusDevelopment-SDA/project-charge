import { useEffect, useState } from "react";

export function usePollingChartData<T>(
  initialData: T[],
  generator: (base: T[]) => T[],
  intervalMs = 15000
) {
  const [data, setData] = useState<T[]>(initialData);

  useEffect(() => {
    const interval = setInterval(() => {
      setData(generator(initialData));
    }, intervalMs);

    return () => clearInterval(interval);
  }, [generator, initialData, intervalMs]);

  return { data };
}
