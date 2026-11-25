"use client";

import { useMemo } from "react";
import { WheelColumn } from "@/components/signup-birth-date-picker";
import { MAX_HEIGHT_CM, MIN_HEIGHT_CM } from "@/lib/profile-height";

/** 0 stands for "no height" in the optional wheel. */
export const NO_HEIGHT = 0;

/**
 * Height in cm on a scroll wheel, like the birth date: no keyboard, so nothing
 * covers the Continue/Save button. `optional` adds a "—" row (no height) at the
 * top, for people who need not give one.
 */
export default function ProfileHeightWheel({
  value,
  onChange,
  optional = false,
  label = "cm",
  picked = true,
  onPicked,
}: {
  value: number;
  onChange: (value: number) => void;
  optional?: boolean;
  label?: string;
  /** False until the person picked: the value shows grey, as a suggestion only. */
  picked?: boolean;
  onPicked?: () => void;
}) {
  const values = useMemo(() => {
    const range = Array.from({ length: MAX_HEIGHT_CM - MIN_HEIGHT_CM + 1 }, (_, index) => MIN_HEIGHT_CM + index);
    return optional ? [NO_HEIGHT, ...range] : range;
  }, [optional]);
  return (
    <div className="mx-auto w-full max-w-[180px]" data-qa="profile-height-wheel">
      <WheelColumn
        values={values}
        selectedValue={value}
        label={label}
        formatValue={(height) => (height === NO_HEIGHT ? "—" : `${height}`)}
        onChange={onChange}
        picked={picked}
        onPicked={onPicked}
      />
    </div>
  );
}
