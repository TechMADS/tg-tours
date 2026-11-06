export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`w-full max-w-[184px] ${inverse ? "text-white" : "text-foreground"}`}>
      <span className="block text-lg leading-tight font-bold">ABC Tours</span>
      <span className={`${inverse ? "text-white/75" : "text-muted-foreground"} text-xs font-medium uppercase`}>
        and Travels
      </span>
    </div>
  );
}