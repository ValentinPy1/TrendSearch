export function GradientOrbs() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      {/* Purple orb - top right */}
      <div 
        className="absolute -top-40 -right-40 w-[800px] h-[800px] rounded-full opacity-20"
        style={{
          background: 'radial-gradient(circle, hsl(270 80% 50% / 0.15), transparent 70%)',
        }}
      />
      
      {/* Blue orb - bottom left */}
      <div 
        className="absolute -bottom-40 -left-40 w-[700px] h-[700px] rounded-full opacity-20"
        style={{
          background: 'radial-gradient(circle, hsl(220 80% 55% / 0.12), transparent 70%)',
        }}
      />
      
      {/* Indigo orb - center */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-15"
        style={{
          background: 'radial-gradient(circle, hsl(240 75% 55% / 0.1), transparent 70%)',
        }}
      />
    </div>
  );
}
