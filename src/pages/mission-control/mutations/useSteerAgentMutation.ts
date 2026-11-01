export function useSteerAgentMutation(injectSteeringHint: (hint: string) => void) {
  const steer = (prompt: string) => {
    if (!prompt.trim()) return;
    injectSteeringHint(prompt.trim());
  };

  return {
    steer
  };
}
