import { DayPicker } from "react-day-picker"
import type { DateRange } from "react-day-picker"
import { ptBR } from "date-fns/locale"
import "react-day-picker/dist/style.css"
import "./calendar.css"

type MyCalendarProps = {
    selected?: DateRange;
    onSelect?: (range: DateRange | undefined) => void;
    mode?: "range" | "single";
    selectedSingle?: Date;
    onSelectSingle?: (date: Date | undefined) => void;
};

export function MyCalendar({ selected, onSelect, mode = "range", selectedSingle, onSelectSingle }: MyCalendarProps) {
    return (
        <div className="calendar-container">
            <div className="calendar-card">
                {mode === "single" ? (
                    <DayPicker
                        className="rdp"
                        locale={ptBR}
                        mode="single"
                        selected={selectedSingle}
                        onSelect={onSelectSingle}
                        captionLayout="dropdown"
                        showOutsideDays
                    />
                ) : (
                    <DayPicker
                        className="rdp"
                        locale={ptBR}
                        mode="range"
                        selected={selected}
                        onSelect={onSelect}
                        captionLayout="dropdown"
                        showOutsideDays
                    />
                )}
            </div>
        </div>
    )
}
