import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { X, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// Simple retry helper
const fetchWithRetry = async (fn, retries = 3, delay = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return fetchWithRetry(fn, retries - 1, delay * 1.5);
  }
};

const WelcomePopup = () => {
    const { user } = useAuth();
    const [popups, setPopups] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAutoPlaying, setIsAutoPlaying] = useState(true);
    const [direction, setDirection] = useState(0);

    useEffect(() => {
        const fetchPopups = async () => {
            try {
                const { data, error } = await fetchWithRetry(() => 
                    supabase
                        .from('welcome_popups')
                        .select('image_url, alt_text')
                        .eq('is_active', true)
                        .order('created_at', { ascending: true })
                );

                if (error) {
                    console.error('Error fetching welcome popups:', error);
                } else if (data && data.length > 0) {
                    setPopups(data);
                    const sessionKey = user ? `hasSeenWelcomePopup_${user.id}` : 'hasSeenWelcomePopup';
                    const hasSeenPopup = sessionStorage.getItem(sessionKey);
                    if (!hasSeenPopup) {
                        setIsOpen(true);
                        sessionStorage.setItem(sessionKey, 'true');
                    }
                }
            } catch (err) {
                console.error('Failed to fetch welcome popups after retries:', err);
            }
        };
        fetchPopups();
    }, [user]);

    useEffect(() => {
        if (!isOpen || popups.length <= 1 || !isAutoPlaying) return;

        const interval = setInterval(() => {
            setDirection(1);
            setCurrentIndex((prevIndex) => (prevIndex + 1) % popups.length);
        }, 2500); // Fast scroll every 2.5 seconds

        return () => clearInterval(interval);
    }, [isOpen, popups.length, isAutoPlaying]);

    const handleNext = useCallback(() => {
        setDirection(1);
        setCurrentIndex((prevIndex) => (prevIndex + 1) % popups.length);
        setIsAutoPlaying(false);
    }, [popups.length]);

    const handlePrev = useCallback(() => {
        setDirection(-1);
        setCurrentIndex((prevIndex) => (prevIndex - 1 + popups.length) % popups.length);
        setIsAutoPlaying(false);
    }, [popups.length]);

    const handleDotClick = (index) => {
        const newDirection = index > currentIndex ? 1 : -1;
        setDirection(newDirection);
        setCurrentIndex(index);
        setIsAutoPlaying(false);
    };

    const toggleAutoPlay = () => {
        setIsAutoPlaying(!isAutoPlaying);
    };

    const handleClose = () => {
        setIsOpen(false);
        setIsAutoPlaying(false);
    };

    const slideVariants = {
        enter: (direction) => ({
            x: direction > 0 ? 300 : -300,
            opacity: 0,
            scale: 0.9,
        }),
        center: {
            x: 0,
            opacity: 1,
            scale: 1,
            zIndex: 1,
        },
        exit: (direction) => ({
            x: direction < 0 ? 300 : -300,
            opacity: 0,
            scale: 0.9,
            zIndex: 0,
        }),
    };

    if (!isOpen || popups.length === 0) {
        return null;
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="p-0 border-0 max-w-lg bg-transparent shadow-none overflow-visible">
                <DialogTitle className="sr-only">Annonce</DialogTitle>
                <div className="relative w-full aspect-[4/5] sm:aspect-video flex items-center justify-center">
                    <AnimatePresence initial={false} custom={direction}>
                        <motion.img
                            key={currentIndex}
                            src={popups[currentIndex].image_url}
                            alt={popups[currentIndex].alt_text || 'Welcome'}
                            custom={direction}
                            variants={slideVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{
                                x: { type: "spring", stiffness: 300, damping: 30 },
                                opacity: { duration: 0.2 }
                            }}
                            className="absolute w-full h-full object-contain rounded-lg shadow-2xl"
                        />
                    </AnimatePresence>
                </div>

                <button
                    onClick={handleClose}
                    className="absolute -top-3 -right-3 bg-white text-gray-800 p-2 rounded-full z-20 hover:bg-gray-100 transition-all shadow-lg border border-gray-200"
                >
                    <X className="h-5 w-5" />
                </button>

                {popups.length > 1 && (
                    <>
                        <button
                            onClick={handlePrev}
                            className="absolute top-1/2 left-0 sm:-left-4 -translate-y-1/2 bg-white/80 text-gray-800 p-2 sm:p-3 rounded-full z-20 hover:bg-white transition-all shadow-lg border border-gray-200 backdrop-blur-sm"
                        >
                            <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                        </button>
                        <button
                            onClick={handleNext}
                            className="absolute top-1/2 right-0 sm:-right-4 -translate-y-1/2 bg-white/80 text-gray-800 p-2 sm:p-3 rounded-full z-20 hover:bg-white transition-all shadow-lg border border-gray-200 backdrop-blur-sm"
                        >
                            <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                        </button>

                        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-3 py-2 shadow-lg border border-gray-200">
                             <button
                                onClick={toggleAutoPlay}
                                className="p-1 text-gray-700 hover:text-gray-900 transition-colors"
                                title={isAutoPlaying ? 'Pause' : 'Play'}
                            >
                                {isAutoPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </button>
                            <div className="flex gap-1.5">
                                {popups.map((_, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleDotClick(index)}
                                        className={`w-2.5 h-2.5 rounded-full transition-all ${
                                            currentIndex === index ? 'bg-blue-600 scale-125' : 'bg-gray-400 hover:bg-gray-600'
                                        }`}
                                        aria-label={`Go to slide ${index + 1}`}
                                    />
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default WelcomePopup;