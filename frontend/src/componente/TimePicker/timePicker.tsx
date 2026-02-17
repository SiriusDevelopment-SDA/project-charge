import { useState } from "react";
import "./timePicker.css";

type MyTimePickerProps = {
    selected?: string;
    onSelect?: (time: string) => void;
};

export function MyTimePicker({ selected, onSelect }: MyTimePickerProps) {
    const [hour, setHour] = useState(selected ? selected.split(":")[0] : "09");
    const [minute, setMinute] = useState(selected ? selected.split(":")[1] : "00");

    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"));
    const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

    const handleHourChange = (newHour: string) => {
        setHour(newHour);
        if (onSelect) {
            onSelect(`${newHour}:${minute}`);
        }
    };

    const handleMinuteChange = (newMinute: string) => {
        setMinute(newMinute);
        if (onSelect) {
            onSelect(`${hour}:${newMinute}`);
        }
    };

    return (
        <div className="timepicker-container">
            <div className="timepicker-card">
                <div className="timepicker-display">
                    <span className="time-display">{hour}:{minute}</span>
                </div>
                <div className="timepicker-selectors">
                    <div className="time-column">
                        <label>Hora</label>
                        <div className="time-scroll">
                            {hours.map((h) => (
                                <button
                                    key={h}
                                    className={`time-option ${h === hour ? "selected" : ""}`}
                                    onClick={() => handleHourChange(h)}
                                >
                                    {h}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="time-separator">:</div>
                    <div className="time-column">
                        <label>Minuto</label>
                        <div className="time-scroll">
                            {minutes.map((m) => (
                                <button
                                    key={m}
                                    className={`time-option ${m === minute ? "selected" : ""}`}
                                    onClick={() => handleMinuteChange(m)}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
