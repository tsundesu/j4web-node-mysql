const express = require('express');
const router = express.Router();
const knex = require('../db/knex');

router.get('/', function (req, res, next) {
  const isAuth = req.isAuthenticated();
  if (isAuth) {
    const userId = req.user.id;
    const filter = req.query.filter || 'all'; // all, active, completed
    const editId = req.query.edit || null;
    const search = req.query.search || '';
    const sort = req.query.sort || 'id_desc'; // id_desc, id_asc, due_date, priority

    // 通知メッセージの判定
    let flashMessage = '';
    if (req.query.msg === 'added') flashMessage = 'タスクを追加しました！';
    if (req.query.msg === 'deleted') flashMessage = 'タスクを削除しました！';
    if (req.query.msg === 'updated') flashMessage = 'タスクを更新しました！';
    if (req.query.msg === 'toggled') flashMessage = 'タスクの状態を更新しました！';
    if (req.query.msg === 'cleared') flashMessage = '完了済みのタスクを一括削除しました！';

    // ユーザーに紐づくタスクをすべて取得し、メモリ上で計算・加工します
    knex("tasks")
      .where({ user_id: userId })
      .then(function (allTasks) {
        // 1. 進捗率の計算
        const totalCount = allTasks.length;
        const completedCount = allTasks.filter(t => t.is_completed).length;
        const progressRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

        // 2. フィルタリング、検索、ソート処理
        let todos = [...allTasks];

        // フィルター
        if (filter === 'active') {
          todos = todos.filter(t => !t.is_completed);
        } else if (filter === 'completed') {
          todos = todos.filter(t => t.is_completed);
        }

        // 検索（部分一致、大文字小文字を区別しない）
        if (search) {
          todos = todos.filter(t => t.content.toLowerCase().includes(search.toLowerCase()));
        }

        // ソート
        if (sort === 'id_asc') {
          todos.sort((a, b) => a.id - b.id);
        } else if (sort === 'due_date') {
          // 期限が近い順（期限なしは後ろ）
          todos.sort((a, b) => {
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date) - new Date(b.due_date);
          });
        } else if (sort === 'priority') {
          // 優先度が高い順（高 -> 中 -> 低）
          const weights = { 'high': 1, 'medium': 2, 'low': 3 };
          todos.sort((a, b) => weights[a.priority] - weights[b.priority]);
        } else {
          // デフォルト：登録が新しい順 (id_desc)
          todos.sort((a, b) => b.id - a.id);
        }

        res.render('index', {
          title: 'ToDo App',
          todos: todos,
          isAuth: isAuth,
          filter: filter,
          editId: editId,
          search: search,
          sort: sort,
          progressRate: progressRate,
          totalCount: totalCount,
          completedCount: completedCount,
          flashMessage: flashMessage,
        });
      })
      .catch(function (err) {
        console.error(err);
        res.render('index', {
          title: 'ToDo App',
          isAuth: isAuth,
          filter: filter,
          editId: editId,
          search: search,
          sort: sort,
          progressRate: 0,
          totalCount: 0,
          completedCount: 0,
          flashMessage: '',
          errorMessage: [err.sqlMessage],
        });
      });
  } else {
    res.render('index', {
      title: 'ToDo App',
      isAuth: isAuth,
    });
  }
});

// タスクの追加
router.post('/', function (req, res, next) {
  const isAuth = req.isAuthenticated();
  if (isAuth) {
    const userId = req.user.id;
    const todo = req.body.add;
    const dueDate = req.body.due_date || null;
    const priority = req.body.priority || 'medium';
    knex("tasks")
      .insert({ user_id: userId, content: todo, due_date: dueDate, priority: priority })
      .then(function () {
        res.redirect('/?msg=added');
      })
      .catch(function (err) {
        console.error(err);
        res.redirect('/');
      });
  } else {
    res.redirect('/');
  }
});

// タスクの完了・未完了の切り替え
router.post('/toggle', function (req, res, next) {
  const isAuth = req.isAuthenticated();
  if (isAuth) {
    const userId = req.user.id;
    const taskId = req.body.id;
    // 修正箇所：'true' または '1' の場合を真（true）と判定する
    const currentStatus = (req.body.current_status === 'true' || req.body.current_status === '1');
    knex("tasks")
      .where({ id: taskId, user_id: userId })
      .update({ is_completed: !currentStatus })
      .then(function () {
        res.redirect('/?msg=toggled');
      })
      .catch(function (err) {
        console.error(err);
        res.redirect('/');
      });
  } else {
    res.redirect('/');
  }
});

// タスクの編集（更新）
router.post('/edit', function (req, res, next) {
  const isAuth = req.isAuthenticated();
  if (isAuth) {
    const userId = req.user.id;
    const taskId = req.body.id;
    const content = req.body.content;
    const dueDate = req.body.due_date || null;
    const priority = req.body.priority || 'medium';
    knex("tasks")
      .where({ id: taskId, user_id: userId })
      .update({ content: content, due_date: dueDate, priority: priority })
      .then(function () {
        res.redirect('/?msg=updated');
      })
      .catch(function (err) {
        console.error(err);
        res.redirect('/');
      });
  } else {
    res.redirect('/');
  }
});

// タスクの削除
router.post('/delete', function (req, res, next) {
  const isAuth = req.isAuthenticated();
  if (isAuth) {
    const userId = req.user.id;
    const taskId = req.body.id;
    knex("tasks")
      .where({ id: taskId, user_id: userId })
      .del()
      .then(function () {
        res.redirect('/?msg=deleted');
      })
      .catch(function (err) {
        console.error(err);
        res.redirect('/');
      });
  } else {
    res.redirect('/');
  }
});

// 完了済みタスクの一括削除
router.post('/clear-completed', function (req, res, next) {
  const isAuth = req.isAuthenticated();
  if (isAuth) {
    const userId = req.user.id;
    knex("tasks")
      .where({ user_id: userId, is_completed: true })
      .del()
      .then(function () {
        res.redirect('/?msg=cleared');
      })
      .catch(function (err) {
        console.error(err);
        res.redirect('/');
      });
  } else {
    res.redirect('/');
  }
});

router.use('/signup', require('./signup'));
router.use('/signin', require('./signin'));
router.use('/logout', require('./logout'));

module.exports = router;