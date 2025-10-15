export function GradientOrbs() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Purple orb - top right */}
      <div 
        className="absolute -top-[20%] -right-[10%] w-[900px] h-[900px] rounded-full opacity-50"
        style={{
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.6), transparent 70%)',
          filter: 'blur(100px)',
        }}
      />
      
      {/* Blue/Cyan orb - bottom left */}
      <div 
        className="absolute -bottom-[15%] -left-[15%] w-[1000px] h-[1000px] rounded-full opacity-40"
        style={{
          background: 'radial-gradient(circle, rgba(56, 189, 248, 0.5), transparent 70%)',
          filter: 'blur(100px)',
        }}
      />
      
      {/* Pink/Magenta orb - top left */}
      <div 
        className="absolute top-[10%] -left-[20%] w-[700px] h-[700px] rounded-full opacity-35"
        style={{
          background: 'radial-gradient(circle, rgba(236, 72, 153, 0.4), transparent 70%)',
          filter: 'blur(90px)',
        }}
      />
      
      {/* Teal orb - bottom right */}
      <div 
        className="absolute -bottom-[10%] -right-[20%] w-[800px] h-[800px] rounded-full opacity-40"
        style={{
          background: 'radial-gradient(circle, rgba(20, 184, 166, 0.45), transparent 70%)',
          filter: 'blur(100px)',
        }}
      />
      
      {/* Central purple-blue blend */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-30"
        style={{
          background: 'radial-gradient(circle, rgba(139, 92, 246, 0.4), transparent 70%)',
          filter: 'blur(80px)',
        }}
      />
    </div>
  );
}
