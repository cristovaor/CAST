import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  name: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
}

export function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <nav aria-label="Progress">
      <ol role="list" className="space-y-4 md:flex md:space-y-0 md:space-x-8">
        {steps.map((step, index) => {
          const isCompleted = currentStep > index;
          const isCurrent = currentStep === index;

          return (
            <li key={step.name} className="md:flex-1">
              <div
                className={cn(
                  "group flex flex-col border-l-4 py-2 pl-4 md:border-l-0 md:border-t-4 md:pb-0 md:pl-0 md:pt-4",
                  isCompleted ? "border-primary" : isCurrent ? "border-primary" : "border-muted"
                )}
              >
                <span className="text-sm font-medium flex items-center gap-2">
                  {isCompleted ? (
                    <span className="text-primary flex items-center">
                      Step {index + 1}
                      <Check className="ml-2 h-4 w-4" />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        isCurrent ? "text-primary" : "text-muted-foreground"
                      )}
                    >
                      Step {index + 1}
                    </span>
                  )}
                </span>
                <span className={cn("text-sm font-medium", isCurrent ? "text-foreground" : "text-muted-foreground")}>
                  {step.name}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
