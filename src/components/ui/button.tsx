import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button-variants";

 

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const classNameStr = typeof className === 'string' ? className : '';
    const isGradientButton = classNameStr.includes('bg-gradient-primary') || classNameStr.includes('gradient-primary');
    const hasTextColor = classNameStr.includes('text-');
    const finalClassName = isGradientButton && !hasTextColor 
      ? cn(buttonVariants({ variant, size }), 'text-primary-foreground', className)
      : buttonVariants({ variant, size, className });
    return <Comp className={finalClassName} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
