import { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";

interface WordCountBarProps {
  text: string;
  className?: string;
}

function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function countCharacters(text: string): number {
  if (!text) return 0;
  return text.length;
}

function estimateReadingTime(wordCount: number): number {
  // Average reading speed: ~200 words per minute
  const WPM = 200;
  return Math.max(1, Math.ceil(wordCount / WPM));
}

export function WordCountBar({ text, className }: WordCountBarProps) {
  const stats = useMemo(() => {
    const words = countWords(text);
    const chars = countCharacters(text);
    const minutes = estimateReadingTime(words);
    return { words, chars, minutes };
  }, [text]);

  return (
    <div
      className={`word-count-bar ${className ?? ""}`}
      role="status"
      aria-label="Document statistics"
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={stats.words}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="word-count-item"
        >
          {stats.words.toLocaleString()} {stats.words === 1 ? "word" : "words"}
        </motion.span>
      </AnimatePresence>

      <span className="word-count-separator">|</span>

      <AnimatePresence mode="wait">
        <motion.span
          key={stats.chars}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="word-count-item"
        >
          {stats.chars.toLocaleString()}{" "}
          {stats.chars === 1 ? "character" : "characters"}
        </motion.span>
      </AnimatePresence>

      <span className="word-count-separator">|</span>

      <AnimatePresence mode="wait">
        <motion.span
          key={stats.minutes}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="word-count-item"
        >
          {stats.minutes} min read
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
