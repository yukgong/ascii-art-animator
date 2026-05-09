import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props) {
  const thumbCount =
    value != null
      ? Array.isArray(value) ? value.length : 1
      : defaultValue != null
        ? Array.isArray(defaultValue) ? defaultValue.length : 1
        : 1

  return (
    <SliderPrimitive.Root
      className={cn("relative flex w-full touch-none select-none items-center py-3 cursor-pointer", className)}
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="relative flex w-full items-center">
        <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-none bg-border overflow-hidden">
          <SliderPrimitive.Indicator className="absolute h-full rounded-none bg-foreground/70" />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbCount }, (_, index) => (
          <SliderPrimitive.Thumb
            key={index}
            className="absolute block h-3.5 w-3.5 rounded-none border border-border bg-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
