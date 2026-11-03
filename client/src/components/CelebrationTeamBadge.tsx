export default function CelebrationTeamBadge({ color }: { color?: string | null }) {
  if (!color) return null;
  return (
    <span className={color === "verde"
      ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
      : "rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-900 dark:bg-blue-950 dark:text-blue-200"}>
      Equipe {color}
    </span>
  );
}
