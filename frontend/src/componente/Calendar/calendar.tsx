import { DayPicker } from "react-day-picker"
import type { DateRange } from "react-day-picker"
import { ptBR } from "date-fns/locale"
import "react-day-picker/dist/style.css"
import "./calendar.css"

type MyCalendarProps = {
    selected?: DateRange;
    onSelect?: (range: DateRange | undefined) => void;
};

export function MyCalendar({ selected, onSelect }: MyCalendarProps) {
    return (
        <div className="calendar-container">
            <div className="calendar-card">
                <DayPicker
                    className="rdp"
                    locale={ptBR}
                    mode="range"
                    selected={selected}
                    onSelect={onSelect}
                    captionLayout="dropdown"
                    showOutsideDays
                />
            </div>
        </div>
    )
}
