/**
 * Chat-list search field. Purely presentational: the parent owns the query
 * string and does the local case-insensitive filtering. No logging.
 */
import { SearchIcon, CloseIcon } from '../icons';
import styles from './chatList.module.css';

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

export default function SearchBar({ value, onChange, placeholder = 'Search conversations' }: Props) {
  return (
    <div className={styles['searchWrap']}>
      <div className={styles['searchField']}>
        <span className={styles['searchIcon']} aria-hidden="true">
          <SearchIcon size={18} />
        </span>
        <input
          type="text"
          className={styles['searchInput']}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {value ? (
          <button
            type="button"
            className={styles['searchClear']}
            aria-label="Clear search"
            title="Clear search"
            onClick={() => onChange('')}
          >
            <CloseIcon size={16} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
