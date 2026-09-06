"use client";

import { useEffect, useRef } from "react";
import { view } from "../game-view.js";
import { mountGame } from "../game.js";

// Both the GitHub Pages edition and the app use the same UI and learning engine.
export default function Home() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (root.current) return mountGame(root.current);
  }, []);
  return <div ref={root} dangerouslySetInnerHTML={{ __html: view }} />;
}
