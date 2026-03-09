import { useState } from "react";

type Params = {
  onUpload: (file: File, rows?: Record<string, string>[]) => void;
};

export function useUploadButtonController({ onUpload }: Params) {
  const [loading, setLoading] = useState(false);

  const handleFile: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    try {
      setLoading(true);
      const file = event.target.files?.[0];
      if (!file) return;
      onUpload(file);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    handleFile,
  };
}
