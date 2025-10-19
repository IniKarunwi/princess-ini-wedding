import { motion } from "framer-motion";

const StatsBar = () => {
  const stats = [
    { number: "5+", label: "years of experience" },
    { number: "$3M+", label: "ARR contributed" },
    { number: "60+", label: "projects built" },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="w-full border-t border-b border-border/30 py-3 md:py-5"
      style={{ backgroundColor: '#0B0F0C' }}
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-row items-center justify-between gap-4 md:gap-6">
          {stats.map((stat, index) => (
            <div key={index} className="flex items-center gap-3 md:gap-6">
              <div className="text-center whitespace-nowrap">
                <div className="text-2xl md:text-3xl font-bold mb-1" style={{ color: '#9FFF60' }}>
                  {stat.number}
                </div>
                <div className="text-xs md:text-sm text-muted-foreground">
                  / {stat.label}
                </div>
              </div>
              {index < stats.length - 1 && (
                <div className="text-xl md:text-2xl" style={{ color: '#9FFF60' }}>
                  ✦
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
};

export default StatsBar;
