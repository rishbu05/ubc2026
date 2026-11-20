// One icon set (Lucide), one size and stroke everywhere. Use <Icon as={X} />.
import type { LucideIcon } from "lucide-react";

export default function Icon({ as: C, className = "", label }: { as: LucideIcon; className?: string; label?: string }) {
  return <C size={16} strokeWidth={2} className={`inline-block shrink-0 ${className}`} aria-hidden={label ? undefined : true} aria-label={label} />;
}
