import { audio } from './engine/audio.js';
import { QUIZ_DIFFICULTIES, QuizBank, QuizGate } from './game/quiz.js?v=tactics';
import { UPGRADE_DEFS } from './game/upgrade.js';

const PREFERENCE = 'emberwatch.quiz-difficulty';

export function initQuizPanel({ config, upgrades, economy, isGameOver }) {
  const byId = id => document.getElementById(id);
  const dialog = byId('quiz-dialog'), select = byId('quiz-difficulty');
  const options = byId('quiz-options'), feedback = byId('quiz-feedback'), timer = byId('quiz-timer');
  const review = byId('quiz-review'), retry = byId('quiz-retry'), back = byId('quiz-return');
  const explanationText = byId('quiz-explanation');
  retry.setAttribute('aria-describedby', explanationText.id);
  try {
    const saved = localStorage.getItem(PREFERENCE);
    if (Object.hasOwn(QUIZ_DIFFICULTIES, saved)) select.value = saved;
  } catch { /* 本局仍可选档 */ }
  select.addEventListener('change', () => {
    try { localStorage.setItem(PREFERENCE, select.value); } catch { /* 本局选择仍有效 */ }
  });

  const gate = new QuizGate({
    bank: new QuizBank(config), upgrades, economy,
    onOpen: () => {
      const { key, question } = gate;
      byId('quiz-upgrade-label').textContent = QUIZ_DIFFICULTIES[question.difficulty] + ' · ' +
        UPGRADE_DEFS[key].label + ' Lv.' + (upgrades.getLevel(key) + 1) + ' · 答对扣除 ' + upgrades.getCost(key) + ' 金';
      byId('quiz-question').textContent = question.q;
      feedback.textContent = '';
      review.hidden = true;
      options.replaceChildren();
      question.options.forEach((answer, i) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'quiz-opt';
        option.textContent = (i + 1) + '. ' + answer;
        option.addEventListener('click', () => gate.submit(i));
        options.append(option);
      });
      timer.hidden = false;
      timer.textContent = Math.ceil(gate.remaining) + 's';
      timer.classList.remove('is-low');
      if (!dialog.open) dialog.showModal();
      dialog.scrollTop = 0;
      options.firstElementChild.focus({preventScroll: true});
    },
    onClose: () => dialog.close(),
    onResolve: ({ correct, applied, timedOut, answerIndex }) => {
      audio.play(applied ? 'upgrade' : 'button');
      feedback.textContent = applied ? '答对了，强化已生效。' : correct ? '金币不足，未能强化。' :
        timedOut ? '时间到，本次未扣金币。' : '答错了，本次未扣金币。';
      feedback.className = applied ? 'is-correct' : 'is-wrong';
      const { answer, explanation } = gate.question;
      [...options.children].forEach((option, i) => {
        option.disabled = true;
        option.classList.toggle('is-correct', i === answer);
        option.classList.toggle('is-wrong', !correct && i === answerIndex);
      });
      timer.hidden = true;
      if (!correct) {
        explanationText.textContent = '正确答案是「' + gate.question.options[answer] + '」。' + explanation;
        review.hidden = false;
        retry.focus({preventScroll: true});
        review.scrollIntoView({block: 'nearest'});
      }
    },
  });

  dialog.addEventListener('cancel', event => { event.preventDefault(); gate.close(); });
  back.addEventListener('click', () => gate.close());
  retry.addEventListener('click', () => {
    if (!gate.retry()) gate.close();
  });
  for (const btn of document.querySelectorAll('.up-btn')) {
    btn.addEventListener('click', () => {
      if (!isGameOver()) gate.open(btn.dataset.up, select.value);
    });
  }
  return gate;
}
