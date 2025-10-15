export function GradientOrbs() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
      {/* Purple orb - top right */}
      <div 
        className="absolute -top-[20%] -right-[10%] w-[900px] h-[900px] rounded-full blur-3xl opacity-30"
        style={{
          background: 'radial-gradient(circle, hsl(280 100% 60% / 0.4), transparent 65%)',
        }}
      />
      
      {/* Blue/Cyan orb - bottom left */}
      <div 
        className="absolute -bottom-[15%] -left-[15%] w-[1000px] h-[1000px] rounded-full blur-3xl opacity-25"
        style={{
          background: 'radial-gradient(circle, hsl(200 100% 55% / 0.35), transparent 65%)',
        }}
      />
      
      {/* Pink/Magenta orb - top left */}
      <div 
        className="absolute top-[10%] -left-[20%] w-[700px] h-[700px] rounded-full blur-3xl opacity-20"
        style={{
          background: 'radial-gradient(circle, hsl(320 100% 60% / 0.3), transparent 70%)',
        }}
      />
      
      {/* Teal orb - bottom right */}
      <div 
        className="absolute -bottom-[10%] -right-[20%] w-[800px] h-[800px] rounded-full blur-3xl opacity-25"
        style={{
          background: 'radial-gradient(circle, hsl(180 100% 50% / 0.3), transparent 70%)',
        }}
      />
      
      {/* Central purple-blue blend */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl opacity-15"
        style={{
          background: 'radial-gradient(circle, hsl(260 100% 65% / 0.25), transparent 70%)',
        }}
      />
    </div>
  );
}
