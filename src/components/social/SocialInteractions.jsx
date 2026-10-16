import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { toast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Heart, MessageCircle, Share2, Send, Loader2, Copy, Twitter, Facebook, Link as LinkIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const SocialInteractions = ({ event, onInteraction, variant = 'horizontal' }) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [likesCount, setLikesCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [loadingLike, setLoadingLike] = useState(false);
  
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComment, setLoadingComment] = useState(false);
  const [loadingCommentsList, setLoadingCommentsList] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (event) {
      fetchInteractionCounts();
      if (user) checkUserLike();
    }
  }, [event, user]);

  const fetchInteractionCounts = async () => {
    if (!event?.id) return;
    
    try {
      const { count: likes } = await supabase
        .from('user_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('interaction_type', 'like');
      
      const { count: comments } = await supabase
        .from('event_comments')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id);

      setLikesCount(likes || 0);
      setCommentsCount(comments || 0);
    } catch (error) {
      console.error('Error fetching interaction counts:', error);
    }
  };

  const checkUserLike = async () => {
    if (!event?.id || !user?.id) return;
    
    try {
      const { data } = await supabase
        .from('user_interactions')
        .select('id')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .eq('interaction_type', 'like')
        .maybeSingle();
      
      setIsLiked(!!data);
    } catch (error) {
      console.error('Error checking user like:', error);
    }
  };

  const fetchComments = async () => {
    if (!event?.id) return;
    setLoadingCommentsList(true);
    try {
      const { data, error } = await supabase
        .from('event_comments')
        .select('*, profiles(full_name, avatar_url)')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false });
      
      if (!error && data) setComments(data);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoadingCommentsList(false);
    }
  };

  // 🔥 GESTION DU LIKE AVEC PROTECTION CONTRE LES ERREURS 403
  const handleLike = async () => {
    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Connectez-vous pour aimer cet événement.",
        variant: "destructive"
      });
      return;
    }

    setLoadingLike(true);
    try {
      if (isLiked) {
        // Unlike
        const { error } = await supabase
          .from('user_interactions')
          .delete()
          .eq('event_id', event.id)
          .eq('user_id', user.id)
          .eq('interaction_type', 'like');
        
        if (error) throw error;
        
        setIsLiked(false);
        setLikesCount(prev => Math.max(0, prev - 1));
      } else {
        // Like
        const { error } = await supabase.rpc('protected_event_interaction', {
          p_event_id: event.id,
          p_user_id: user.id,
          p_interaction_type: 'like'
        });
        
        // 🔥 Ignorer les erreurs 403 (événement terminé)
        if (error) {
          if (error.code === '403' || 
              error.message?.includes('permission') ||
              error.message?.includes('Event is finished')) {
            console.log('ℹ️ Événement terminé, like ignoré');
            toast({
              title: "Action impossible",
              description: "Cet événement est terminé.",
              variant: "destructive"
            });
            return;
          }
          throw error;
        }
        
        setIsLiked(true);
        setLikesCount(prev => prev + 1);
      }
      
      if (onInteraction) onInteraction();
      
    } catch (error) {
      // 🔥 Ignorer les erreurs de permission
      if (error.code === '403' || 
          error.message?.includes('permission') ||
          error.message?.includes('Event is finished')) {
        console.log('ℹ️ Permission refusée pour cette interaction');
        return;
      }
      
      console.error('Error toggling like:', error);
      toast({
        title: "Erreur",
        description: "Impossible de réaliser cette action.",
        variant: "destructive"
      });
    } finally {
      setLoadingLike(false);
    }
  };

  const handlePostComment = async () => {
    if (!newComment.trim() || !user) {
      toast({
        title: "Connexion requise",
        description: "Connectez-vous pour commenter.",
        variant: "destructive"
      });
      return;
    }

    setLoadingComment(true);
    try {
      const { error } = await supabase
        .from('event_comments')
        .insert({
          event_id: event.id,
          user_id: user.id,
          comment_text: newComment.trim(),
          is_approved: true
        });

      if (error) {
        // 🔥 Ignorer les erreurs 403 (événement terminé)
        if (error.code === '403' || 
            error.message?.includes('permission') ||
            error.message?.includes('Event is finished')) {
          toast({
            title: "Action impossible",
            description: "Cet événement est terminé.",
            variant: "destructive"
          });
          return;
        }
        throw error;
      }

      setNewComment("");
      setCommentsCount(prev => prev + 1);
      fetchComments();
      
      toast({
        title: "Commentaire envoyé",
        description: "Votre commentaire a été publié.",
        variant: "default",
        className: "bg-green-600 text-white border-none"
      });
      
      if (onInteraction) onInteraction();
      
    } catch (error) {
      // 🔥 Ignorer les erreurs de permission
      if (error.code === '403' || 
          error.message?.includes('permission') ||
          error.message?.includes('Event is finished')) {
        console.log('ℹ️ Permission refusée pour le commentaire');
        return;
      }
      
      console.error('Error posting comment:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer le commentaire.",
        variant: "destructive"
      });
    } finally {
      setLoadingComment(false);
    }
  };

  const handleNativeShare = async () => {
    const shareData = {
      title: event.title,
      text: `Découvrez cet événement : ${event.title}`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        // Track share
        if (user) {
          try {
            await supabase
              .from('event_shares')
              .insert({ event_id: event.id, user_id: user.id, share_platform: 'native' });
          } catch (e) {
            console.log('Share tracking error:', e);
          }
        }
      } catch (err) {
        // Native share cancelled or failed
        setShareOpen(true);
      }
    } else {
      setShareOpen(true);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Lien copié",
      description: "URL copiée dans le presse-papier.",
      variant: "default",
      className: "bg-blue-600 text-white border-none"
    });
    setShareOpen(false);
  };

  const shareToSocial = (platform) => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`Découvrez cet événement : ${event.title}`);
    let shareUrl = '';

    switch (platform) {
      case 'whatsapp': shareUrl = `https://wa.me/?text=${text}%20${url}`; break;
      case 'facebook': shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`; break;
      case 'twitter': shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`; break;
      default: return;
    }
    
    if (shareUrl) {
      window.open(shareUrl, '_blank');
      if (user) {
        try {
          supabase
            .from('event_shares')
            .insert({ event_id: event.id, user_id: user.id, share_platform: platform });
        } catch (e) {
          console.log('Share tracking error:', e);
        }
      }
    }
    setShareOpen(false);
  };

  // Styles based on variant
  const containerClass = variant === 'vertical' 
    ? "flex flex-col gap-4 items-center" 
    : "flex items-center justify-between py-2 border-t border-b bg-card/50 px-4 rounded-lg";

  const buttonClass = (active) => cn(
    "flex items-center justify-center transition-all",
    variant === 'vertical' 
      ? `w-12 h-12 rounded-full shadow-lg backdrop-blur-md ${active ? 'bg-white text-red-500' : 'bg-black/40 text-white hover:bg-black/60'}`
      : "gap-2 variant-ghost size-sm"
  );

  const iconSize = variant === 'vertical' ? "w-6 h-6" : "w-5 h-5";
  const textSize = variant === 'vertical' ? "text-xs font-bold text-white drop-shadow-md mt-1" : "text-sm font-medium";

  const VerticalButton = ({ icon: Icon, label, count, active, onClick, loading, title }) => (
    <div className="flex flex-col items-center">
      <button 
        onClick={onClick}
        disabled={loading}
        title={title}
        className={buttonClass(active)}
      >
        {loading ? <Loader2 className={`${iconSize} animate-spin`} /> : <Icon className={`${iconSize} ${active ? 'fill-current' : ''}`} />}
      </button>
      <span className={textSize}>{count}</span>
    </div>
  );

  if (!event) return null;

  return (
    <>
      <div className={containerClass}>
        {/* Like */}
        {variant === 'vertical' ? (
          <VerticalButton icon={Heart} label="J'aime" count={likesCount} active={isLiked} onClick={handleLike} loading={loadingLike} title={!user ? t('common.limits.loginRequired') : ''} />
        ) : (
          <Button variant="ghost" size="sm" className={cn("flex gap-2", isLiked ? 'text-red-500' : 'text-muted-foreground')} onClick={handleLike} disabled={loadingLike || !user} title={!user ? t('common.limits.loginRequired') : ''}>
            {loadingLike ? <Loader2 className="w-5 h-5 animate-spin" /> : <Heart className={cn("w-5 h-5", isLiked && "fill-current")} />}
            <span>{likesCount || "J'aime"}</span>
          </Button>
        )}

        {/* Comment */}
        <Dialog onOpenChange={(open) => { if(open) fetchComments(); }}>
          <DialogTrigger asChild>
            {variant === 'vertical' ? (
              <div className="flex flex-col items-center cursor-pointer">
                <div className={buttonClass(false)}>
                  <MessageCircle className={iconSize} />
                </div>
                <span className={textSize}>{commentsCount}</span>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="flex gap-2 text-muted-foreground">
                <MessageCircle className="w-5 h-5" />
                <span>{commentsCount || "SMS"}</span>
              </Button>
            )}
          </DialogTrigger>
          
          <DialogContent className="sm:max-w-[500px] h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Commentaires ({commentsCount})</DialogTitle>
            </DialogHeader>
            
            <ScrollArea className="flex-1 pr-4 -mr-4">
              {loadingCommentsList ? (
                <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
              ) : comments.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Aucun commentaire. Soyez le premier !</p>
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={comment.profiles?.avatar_url} />
                        <AvatarFallback>U</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between">
                          <span className="font-semibold">{comment.profiles?.full_name || 'Utilisateur'}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: fr })}
                          </span>
                        </div>
                        <p className="text-sm bg-muted/50 p-2 rounded-lg">{comment.comment_text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            
            <div className="mt-4 pt-4 border-t flex gap-2">
              <Textarea 
                placeholder="Votre commentaire..." 
                value={newComment} 
                onChange={(e) => setNewComment(e.target.value)} 
                className="min-h-[40px] resize-none" 
                disabled={!user}
                placeholder={!user ? t('common.limits.loginRequired') : undefined}
                title={!user ? t('common.limits.loginRequired') : undefined}
              />
              <Button 
                size="icon" 
                onClick={handlePostComment} 
                disabled={loadingComment || !newComment.trim() || !user}
                title={!user ? t('common.limits.loginRequired') : ''}
              >
                {loadingComment ? <Loader2 className="animate-spin" /> : <Send />}
              </Button>
            </div>
            
            {!user && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                Connectez-vous pour commenter.
              </p>
            )}
          </DialogContent>
        </Dialog>

        {/* Share */}
        {variant === 'vertical' ? (
          <VerticalButton icon={Share2} label="Partager" count="Partager" active={false} onClick={handleNativeShare} />
        ) : (
          <Button variant="ghost" size="sm" className="flex gap-2 text-muted-foreground" onClick={handleNativeShare}>
            <Share2 className="w-5 h-5" />
            <span>Partager</span>
          </Button>
        )}
      </div>

      {/* Share Modal Fallback */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Partager cet événement</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <Button 
              variant="outline" 
              className="flex flex-col h-20 gap-2 hover:bg-green-50 hover:text-green-600 hover:border-green-200" 
              onClick={() => shareToSocial('whatsapp')}
            >
              <MessageCircle className="w-8 h-8" /> WhatsApp
            </Button>
            <Button 
              variant="outline" 
              className="flex flex-col h-20 gap-2 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200" 
              onClick={() => shareToSocial('facebook')}
            >
              <Facebook className="w-8 h-8" /> Facebook
            </Button>
            <Button 
              variant="outline" 
              className="flex flex-col h-20 gap-2 hover:bg-slate-50 hover:text-black hover:border-slate-300" 
              onClick={() => shareToSocial('twitter')}
            >
              <Twitter className="w-8 h-8" /> X (Twitter)
            </Button>
            <Button 
              variant="outline" 
              className="flex flex-col h-20 gap-2" 
              onClick={copyLink}
            >
              <Copy className="w-8 h-8" /> Copier le lien
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SocialInteractions;