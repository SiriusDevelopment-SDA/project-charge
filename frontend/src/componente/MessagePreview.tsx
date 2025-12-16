"use client";

import  styles from "../styles/MessagePreview.module.css";

interface MessagePreviewProps {
  placeholder?: string;
}

export default function MessagePreview({
  placeholder = "O LUKÃO E GAY",
}: MessagePreviewProps) {
  return (
    <div className={styles.container}>
      <span className={styles.text}>
        {placeholder}
      </span>
    </div>
  );
}
