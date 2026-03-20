import "./timePicker.css";
import { useTimePickerController } from "../../hooks/components/useTimePickerController";

type MyTimePickerProps = {
  selected?: string;
  onSelect?: (time: string) => void;
};

export function MyTimePicker({ selected, onSelect }: MyTimePickerProps) {
  const {
    hour,
    minute,
    hours,
    minutes,
    handleHourChange,
    handleMinuteChange,
  } = useTimePickerController({ selected, onSelect });

  return (
    <div className="timepicker-container">
      <div className="timepicker-card">
        <div className="timepicker-display">
          <span className="time-display">
            {hour}:{minute}
          </span>
        </div>
        <div className="timepicker-selectors">
          <div className="time-column">
            <label>Hora</label>
            <div className="time-scroll">
              {hours.map((currentHour) => (
                <button
                  type="button"
                  key={currentHour}
                  className={`time-option ${currentHour === hour ? "selected" : ""}`}
                  onClick={() => handleHourChange(currentHour)}
                >
                  {currentHour}
                </button>
              ))}
            </div>
          </div>
          <div className="time-separator">:</div>
          <div className="time-column">
            <label>Minuto</label>
            <div className="time-scroll">
              {minutes.map((currentMinute) => (
                <button
                  type="button"
                  key={currentMinute}
                  className={`time-option ${currentMinute === minute ? "selected" : ""}`}
                  onClick={() => handleMinuteChange(currentMinute)}
                >
                  {currentMinute}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
