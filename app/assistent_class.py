""" Класс ассистент, который на заданный вопрос из базы знаний возможных ответов,
текстов документов выбирает наиболее релевантные и выдает лучший или топ-3

ИНИЦИАЦИЯ КЛАССА:
- эмбеддер, объект класса Embedder
- таблица answers_df, содержащая следующую информацию:
-- answer_id, индексами таблицы являются идентификаторы ответов (первые 20 символов эталонного вопроса);
-- question, текст эталонного вопроса (может отсутствовать);
-- url, веб-адрес страницы с ответом;
-- answer_text, предобработанный текст ответа (текстовое содержимое ответа);
опционально:
-- embedding, вектор эмбеддинга ответа (может отсутствовать);

ФУНКЦИИ:
- embedding_fun, ЭМБЕДДИНГ, добавления в таблицу answers_df поля embedding,
    вектор эмбеддинга для каждого ответа, если такого столбца нет;
- поиск лучшего ответа на текстовый вопрос среди имеющихся в answers_df;
- поиск топ-3 лучших ответов на текстовый вопрос среди имеющихся в answers_df;
"""
import numpy as np
import pandas as pd
import os
# from http_proxy import proxy_dict
import torch
from scipy.spatial.distance import cdist
from transformers import AutoTokenizer, AutoModel

def get_data_from_csv_file(path_to_file):
    """ # Загрузка текста вопросов/ответов """
    return pd.read_csv(path_to_file, index_col=0, sep='|', header=0, encoding='utf-8')

def vector_from_str(array_str: str) -> np.ndarray:
    pos1 = array_str.find('[') if array_str.find('[') > -1 else 0
    pos2 = array_str.find(']') if array_str.find(']') > -1 else len(array_str)
    array_str = array_str[pos1 + 1: pos2]
    vector = np.array([float(x) for x in array_str.split()])
    return vector



def get_answers_df_from_csv_file(path_to_file):
    """Загрузка таблицы вопросов/ответов с эмбеддингами"""
    answers_df = pd.read_csv(path_to_file, index_col=0, sep='|', header=0, encoding='utf-8')
    
    # Если есть колонка answer_emb — преобразуем её в numpy
    if 'answer_emb' in answers_df.columns:
        embeddings = [vector_from_str(vect_str) for vect_str in answers_df.loc[:, 'answer_emb']]
        answers_df.loc[:, 'answer_emb'] = embeddings

    # Если колонки url нет — создаём пустую
    if 'url' not in answers_df.columns:
        answers_df['url'] = None

    return answers_df



class Embedder:
    def __init__(self, model_name="cointegrated/LaBSE-en-ru"):
        # Load lazily when this legacy assistant is actually instantiated.
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModel.from_pretrained(model_name)
        self.model.eval()

    def mean_pooling(self, model_output, attention_mask):
        """ усреднение эмбеддингов отдельных токенов предложения """
        token_embeddings = model_output.last_hidden_state
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        return sum_embeddings / sum_mask

    def embedding(self, text):
        """  """
        encoded_input = self.tokenizer(text, padding=True, truncation=True, max_length=512, return_tensors='pt')
        with torch.inference_mode():
            model_output = self.model(**encoded_input)

        sentence_embeddings = self.mean_pooling(model_output, encoded_input['attention_mask'])
        return sentence_embeddings[0].cpu().numpy()


class Assistent:
    def __init__(self, answers_df: pd.DataFrame, embedder=None):
        # инициализация эмбеддера
        if embedder is None:
            self.embedder = Embedder()
        else:
            self.embedder = embedder
        # запоминание таблицы с ответами с добавлением эмбеддинга
        answers_df = answers_df.copy()
        if 'answer_emb' in answers_df.columns:
            self.answers_df = answers_df
        else:
            self.answers_df = self.embedding_answers(answers_df)
        self.question = None
        self.top3_answers_id = None
        self.top3_answers_similarity = None

        

    # def embedding_answers(self, answers_df: pd.DataFrame) -> pd.DataFrame:
    #     """ добавление/изменение эмбеддинга ответов с использованием выбраннного токенизатора и модели векторизации
    #     :param answers_df: таблица со столбцами "question", "answer_url", "answer_text"
    #     :return: столбец "answer_emb" с эмбеддингами ответов
    #     """
    #     # Загрузка модели LaBSE
    #     answers_emb = [self.embedder.embedding(answer) for answer in answers_df.loc[:, "answer_text"]]
    #     answers_df["answer_emb"] = answers_emb
    #     return answers_df
    def embedding_answers(self, answers_df: pd.DataFrame) -> pd.DataFrame:
        """
        Эмбеддинг ЭТАЛОННЫХ ВОПРОСОВ, а не ответов
        """
        answers_emb = [
            self.embedder.embedding(question)
            for question in answers_df.loc[:, "question"]
        ]
        answers_df["answer_emb"] = answers_emb
        return answers_df


    def find_answers(self, question):
        """  поиск топ 3 наиболее подходящих ответов на вопрос
        :param question: текстовый вопрос
        :param answers_df: таблица со столбцами "answer_text", "answer_emb"
        :return: топ 3 ответов в виде словаря:  "answer_id: similarity"
        """
        # запоминаем заданный вопрос
        self.question = question
        # Вычисляем косинусное расстояние
        docs_embedding = np.array(list(self.answers_df.loc[:, "answer_emb"]))
        question_emb = self.embedder.embedding(question)
        quest_embedding = np.array([np.array(question_emb)])
        # print(docs_embedding.shape, quest_embedding.shape )
        dist = cdist(quest_embedding, docs_embedding, metric="cosine")
        # Вычисляем косинусное сходство
        sim = 1 - dist.flatten()
        order = np.argsort(dist.flatten())
        self.top3_answers_id = list(self.answers_df.index[order[:3]])
        self.top3_answers_similarity = sim[order[:3]]

    def get_last_question(self):
        return self.question

    def get_best_answer_id(self):
        return self.top3_answers_id[0]


    def get_top_answers(self, n=3):
        """
        Возвращает топ-N ответов
        """
        if self.top3_answers_id is None:
            return []

        results = []
        for answer_id, similarity in zip(
            self.top3_answers_id[:n],
            self.top3_answers_similarity[:n]
        ):
            results.append({
                "id": answer_id,
                "question": self.answers_df.loc[answer_id, "question"],
                "text": self.answers_df.loc[answer_id, "answer_text"],
                "similarity": float(similarity),
                "url": self.answers_df.loc[answer_id, "url"]
            })
        return results


    def get_best_answer_similarity(self):
        return self.top3_answers_similarity[0]

    def get_best_answer_text(self):
        answer_id = self.get_best_answer_id()
        return self.answers_df.loc[answer_id, 'answer_text']

    def get_best_answer_url(self):
        answer_id = self.get_best_answer_id()
        return self.answers_df.loc[answer_id, 'url']


if __name__ == "__main__":
    datatarget = "./qa_csvfiles"
    answers_df = get_answers_df_from_csv_file(os.path.join(datatarget, "support_answers.csv"))
    assistent = Assistent(answers_df=answers_df)
    print(answers_df.head())
    print("...")
    print(answers_df.tail())
    answers_df.info()
    input("--- нажмите ENTER для продолжения ---")
    os.system('cls' if os.name == 'nt' else 'clear')
    question = input("задайте вопрос: \n")
    while question:
        assistent.find_answers(question)
        print("--------------")
        print(f">> степень сходства: {round(assistent.get_best_answer_similarity(), 3)}")
        print(f">> Текст ответа: \n {assistent.get_best_answer_text()}")
        print("ссылка на оригинал:", assistent.get_best_answer_url())
        input("--- нажмите ENTER для продолжения ---")
        os.system('cls')
        question = input("задайте вопрос:")
