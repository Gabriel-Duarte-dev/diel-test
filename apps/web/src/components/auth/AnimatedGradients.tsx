export function AnimatedGradients() {
  return (
    <div className="pointer-events-none absolute inset-0 diel-gradients-filter">
      <div
        className="
        absolute right-0 top-0
        h-[300%] w-[200%]
        bg-diel-shape-green
        bg-no-repeat
        bg-[length:100%_100%]
        animate-diel-shape-green
      "
      />

      <div
        className="
        absolute right-[-45%] bottom-[-35%]
        h-[400%] w-[150%]
        origin-center
        bg-diel-shape-light-blue
        bg-no-repeat
        bg-[length:100%_100%]
        animate-diel-shape-light-blue
      "
      />
    </div>
  );
}
