import * as React from "react";
import { cn } from "@/lib/utils";

const Image = React.forwardRef(
  ({ src, fittingType = "fill", className, style, onError, ...props }, ref) => (
    <img
      ref={ref}
      src={src || ""}
      loading="lazy"
      className={cn(fittingType === "fit" ? "object-contain" : "object-cover", className)}
      style={style}
      onError={(event) => {
        event.currentTarget.style.visibility = "hidden";
        onError?.(event);
      }}
      {...props}
    />
  )
);
Image.displayName = "Image";

export { Image };
