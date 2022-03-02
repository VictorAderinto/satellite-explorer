import * as styles from './Stories.module.css';
import { StoryCard } from '../StoryCard';

export function Stories() {
  return (
    <div className={styles.menu}>
      <ul className={styles.storiesList}>
        <StoryCard link='satellite-usage' image='./assets/satellite-1.jpg'>
          Why do we need satellites?
        </StoryCard>
        <StoryCard link='satellite-number' image='./assets/satellite-2.jpg'>
          How many satellites are out there?
        </StoryCard>
        <StoryCard link='search' image='./assets/satellite-2.jpg'>
          Search for satellites
        </StoryCard>
      </ul>
    </div>
  );
}
