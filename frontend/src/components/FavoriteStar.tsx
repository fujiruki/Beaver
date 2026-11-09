type Props = {
  isFavorite: boolean;
  onToggle: () => void;
};

export default function FavoriteStar({ isFavorite, onToggle }: Props) {
  return (
    <button
      type="button"
      aria-label={isFavorite ? 'お気に入りを外す' : 'お気に入りにする'}
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className={`px-1.5 py-0.5 rounded text-base leading-none hover:bg-slate-100 ${isFavorite ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'}`}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  );
}
