import { DayPicker } from "react-day-picker"
import type { DateRange } from "react-day-picker"
import { ptBR } from "date-fns/locale"
import "react-day-picker/dist/style.css"
import "./calendar.css"

type MyCalendarProps = {
    selected?: DateRange;
    onSelect?: (range: DateRange | undefined) => void;
    mode?: "range" | "single" | "multiple";
    selectedSingle?: Date;
    onSelectSingle?: (date: Date | undefined) => void;
    selectedMultiple?: Date[];
    onSelectMultiple?: (dates: Date[] | undefined) => void;
    /** Função que retorna true para dias que devem ser desabilitados (fins de semana, feriados) */
    disabledDays?: (date: Date) => boolean;
};

export function MyCalendar({
    selected,
    onSelect,
    mode = "range",
    selectedSingle,
    onSelectSingle,
    selectedMultiple,
    onSelectMultiple,
    disabledDays,
}: MyCalendarProps) {
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
                        disabled={disabledDays}
                    />
                ) : mode === "multiple" ? (
                    <DayPicker
                        className="rdp"
                        locale={ptBR}
                        mode="multiple"
                        selected={selectedMultiple}
                        onSelect={onSelectMultiple}
                        captionLayout="dropdown"
                        showOutsideDays
                        disabled={disabledDays}
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
                        disabled={disabledDays}
                    />
                )}
            </div>
        </div>
    )
}
