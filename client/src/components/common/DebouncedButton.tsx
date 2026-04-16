import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  debounceMs?: number;
};

const DebouncedButton = React.forwardRef<HTMLButtonElement, Props>(
  ({ debounceMs = 800, onClick, disabled, children, ...rest }, ref) => {
    const [isDisabled, setIsDisabled] = React.useState(false);

    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
      if (isDisabled || disabled) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions, @typescript-eslint/no-explicit-any
        onClick && onClick(e as any);
      } finally {
        setIsDisabled(true);
        setTimeout(() => setIsDisabled(false), debounceMs);
      }
    };

    return (
      <button
        {...rest}
        ref={ref}
        onClick={handleClick}
        disabled={isDisabled || disabled}
      >
        {children}
      </button>
    );
  },
);

export default DebouncedButton;
