import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const configuratorColors = {
  primary: "#7AB829",
  primaryHover: "#6BA31F",
  primaryTint: "#F2F8E8",
  ink: "#3F3F3F",
  heading: "#1A1A1A",
  canvas: "#F7F8F6",
  border: "#E5E7E0",
};
