import { Brain, Gauge, Zap, Sparkles, Atom, Circle } from 'lucide-react';

export const codexReasoningEfforts = [
  {
    id: 'default',
    name: 'Default',
    description: 'Use the model default reasoning effort',
    icon: Circle,
    color: 'text-gray-600',
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Fastest response with minimal deliberate reasoning',
    icon: Gauge,
    color: 'text-slate-600',
  },
  {
    id: 'low',
    name: 'Low',
    description: 'Light reasoning with lower latency',
    icon: Brain,
    color: 'text-blue-600',
  },
  {
    id: 'medium',
    name: 'Medium',
    description: 'Balanced depth and latency',
    icon: Zap,
    color: 'text-violet-600',
  },
  {
    id: 'high',
    name: 'High',
    description: 'More deliberate reasoning for harder tasks',
    icon: Sparkles,
    color: 'text-indigo-600',
  },
  {
    id: 'xhigh',
    name: 'Max',
    description: 'Maximum reasoning effort',
    icon: Atom,
    color: 'text-red-600',
  },
] as const;

export type CodexReasoningEffortId = (typeof codexReasoningEfforts)[number]['id'];
