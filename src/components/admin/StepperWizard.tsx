import { Check } from "lucide-react";

interface StepperWizardProps {
  steps: string[];
  currentStep: number;
}

export function StepperWizard({ steps, currentStep }: StepperWizardProps) {
  return (
    <div className="flex items-center gap-2 w-full">
      {steps.map((label, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;
        return (
          <div key={i} className="flex items-center gap-2 flex-1 last:flex-initial">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium border-2 transition-colors ${
                  isCompleted
                    ? "bg-primary border-primary text-primary-foreground"
                    : isActive
                    ? "border-primary text-primary bg-transparent"
                    : "border-muted-foreground/30 text-muted-foreground bg-transparent"
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-[11px] whitespace-nowrap ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mt-[-18px] ${isCompleted ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
