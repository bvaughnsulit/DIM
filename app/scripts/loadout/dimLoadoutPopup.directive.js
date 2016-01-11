(function() {
  'use strict';
  angular.module('dimApp')
    .directive('dimLoadoutPopup', LoadoutPopup);

  LoadoutPopup.$inject = [];

  function LoadoutPopup() {
    return {
      controller: LoadoutPopupCtrl,
      controllerAs: 'vm',
      bindToController: true,
      restrict: 'A',
      scope: {
        store: '=dimLoadoutPopup'
      },
      replace: true,
      template: [
        '<div class="loadout-popup-content">',
        '  <div class="loadout-list"><div class="loadout-set"><span class="button-create" ng-click="vm.newLoadout($event)">+ Create Loadout</span></div></div>',
        '  <div class="loadout-list">',
        '    <div ng-repeat="loadout in vm.loadouts track by loadout.id" class="loadout-set">',
        '      <span class="button-name" title="{{ loadout.name }}" ng-click="vm.applyLoadout(loadout, $event)">{{ loadout.name }}</span>',
        '      <span class="button-delete" ng-click="vm.deleteLoadout(loadout, $event)"><i class="fa fa-trash-o"></i></span>',
        '      <span class="button-edit" ng-click="vm.editLoadout(loadout, $event)"><i class="fa fa-pencil"></i></span>',
        '    </div>',
        '  </div>',
        '  <div class="loadout-list">',
        '    <div class="loadout-set">',
        '      <span class="button-name button-full" ng-click="vm.maxLightLoadout($event)"><i class="fa fa-star"></i> Maximize Light</span>',
        '    </div>',
        '    <div class="loadout-set" ng-if="vm.previousLoadout">',
        '      <span class="button-name button-full" ng-click="vm.applyLoadout(vm.previousLoadout, $event)"><i class="fa fa-undo"></i> {{vm.previousLoadout.name}}</span>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('')
    };
  }

  LoadoutPopupCtrl.$inject = ['$rootScope', 'ngDialog', 'dimLoadoutService', 'dimItemService', 'toaster', '$q', 'dimStoreService', 'dimItemTier'];

  function LoadoutPopupCtrl($rootScope, ngDialog, dimLoadoutService, dimItemService, toaster, $q, dimStoreService, dimItemTier) {
    var vm = this;
    vm.previousLoadout = dimLoadoutService.previousLoadout;

    vm.classTypeId = {
      'warlock': 0,
      'titan': 1,
      'hunter': 2
    }[vm.store.class] || 0;

    dimLoadoutService.getLoadouts()
      .then(function(loadouts) {
        vm.loadouts = _.sortBy(loadouts, 'name') || [];

        vm.loadouts = _.filter(vm.loadouts, function(item) {
          return ((item.classType === -1) || (item.classType === vm.classTypeId));
        });
      });

    vm.newLoadout = function newLoadout($event) {
      ngDialog.closeAll();
      $rootScope.$broadcast('dim-create-new-loadout', {});
    };

    vm.deleteLoadout = function deleteLoadout(loadout, $event) {
      dimLoadoutService.deleteLoadout(loadout);
      $rootScope.$broadcast('dim-delete-loadout', {});

      dimLoadoutService.getLoadouts()
        .then(function(loadouts) {
          vm.loadouts = _.sortBy(loadouts, 'name') || [];

          vm.loadouts = _.filter(vm.loadouts, function(item) {
            return ((item.classType === -1) || (item.classType === vm.classTypeId));
          });
        });
    };

    vm.editLoadout = function editLoadout(loadout, $event) {
      ngDialog.closeAll();
      $rootScope.$broadcast('dim-edit-loadout', {
        loadout: loadout
      });
    };

    function loadoutFromCurrentlyEquipped(items, name) {
      return {
        classType: -1,
        name: name,
        items: _(items)
          .chain()
          .select('equipped')
          .map(function (i) {
            return angular.copy(i);
          })
          .groupBy(function(i) {
            return i.type.toLowerCase();
          }).value()
      };
    }

    vm.applyLoadout = function applyLoadout(loadout, $event) {
      ngDialog.closeAll();

      if (loadout === vm.previousLoadout) {
        vm.previousLoadout = undefined;
      } else {
        vm.previousLoadout = loadoutFromCurrentlyEquipped(vm.store.items, 'Before "' + loadout.name + '"');
      }
      dimLoadoutService.previousLoadout = vm.previousLoadout; // ugly hack

      var scope = {
        failed: false
      };

      var items = _.chain(loadout.items)
        .values()
        .flatten()
        .value();

      var _types = _.chain(items)
        .pluck('type')
        .uniq()
        .value();

      var _items = _.chain(vm.store.items)
        .filter(function(item) {
          return _.contains(_types, item.type);
        })
        .filter(function(item) {
          return (!_.some(items, function(i) {
            return ((i.id === item.id) && (i.hash === item.hash));
          }));
        })
        .groupBy(function(item) {
          return item.type;
        })
        .value();

      applyLoadoutItems(items, loadout, _items, scope);
    };

    // Apply a loadout that's dynamically calculated to maximize Light level (preferring not to change currently-equipped items)
    vm.maxLightLoadout = function maxLightLoadout($event) {
      // These types contribute to light level
      var lightTypes = ['Primary',
                        'Special',
                        'Heavy',
                        'Helmet',
                        'Gauntlets',
                        'Chest',
                        'Leg',
                        'ClassItem',
                        'Artifact',
                        'Ghost'];

      // TODO: this should be a method somewhere that gets all items equippable by a character
      var applicableItems = _.select(dimItemService.getItems(), function(i) {
        return i.equipment &&
          i.primStat !== undefined && // has a primary stat (sanity check)
          (i.classTypeName === 'unknown' || i.classTypeName === vm.store.class) && // for our class
          i.equipRequiredLevel <= vm.store.level && // nothing we are too low-level to equip
          _.contains(lightTypes, i.type) && // one of our selected types
          !i.notransfer; // can be moved
      });
      var itemsByType = _.groupBy(applicableItems, 'type');

      var bestItemFn = function(item) {
        var value = item.primStat.value;

        // Break ties when items have the same stats. Note that this should only
        // add less than 0.25 total, since in the exotics special case there can be
        // three items in consideration and you don't want to go over 1 total.
        if (item.owner == vm.store.id) {
          // Prefer items owned by this character
          value += 0.1;
          if (item.equipped) {
            // Prefer them even more if they're already equipped
            value += 0.1;
          }
        } else if (item.owner == 'vault') {
          // Prefer items in the vault over items owned by a different character
          // (but not as much as items owned by this character)
          value += 0.05;
        }
        return value;
      };

      var isExotic = function(item) {
        return item.tier === dimItemTier.exotic;
      };

      // Pick the best item by primary stat
      var items = {};
      _.each(lightTypes, function(type) {
        if (itemsByType.hasOwnProperty(type)) {
          items[type] = _.max(itemsByType[type], bestItemFn);
        }
      });

      // Solve for the case where our optimizer decided to equip two exotics
      var exoticGroups = [ ['Primary', 'Special', 'Heavy'], ['Helmet', 'Gauntlets', 'Chest', 'Leg'] ];
      _.each(exoticGroups, function(group) {
        var itemsInGroup = _.pick(items, group);
        var numExotics = _.select(_.values(itemsInGroup), isExotic).length;
        if (numExotics > 1) {
          var options = [];

          // Generate an option where we use each exotic
          _.each(itemsInGroup, function(item, type) {
            if (isExotic(item)) {
              var option = angular.copy(itemsInGroup);
              var optionValid = true;
              // Switch the other exotic items to the next best non-exotic
              _.each(_.omit(itemsInGroup, type), function(otherItem, otherType) {
                if (isExotic(otherItem)) {
                  var nonExotics = _.reject(itemsByType[otherType], isExotic);
                  if (_.isEmpty(nonExotics)) {
                    // this option isn't usable because we couldn't swap this exotic for any non-exotic
                    optionValid = false;
                  } else {
                    option[otherType] = _.max(nonExotics, bestItemFn);
                  }
                }
              });

              if (optionValid) {
                options.push(option);
              }
            }
          });

          // Pick the option where the primary stats add up to the biggest number, again favoring equipped stuff
          var bestOption = _.max(options, function(opt) { return _.reduce(_.values(opt), function(sum, i) { return bestItemFn(i) + sum; }, 0) });
          _.assign(items, bestOption);
        }
      });

      // Copy the items and mark them "equipped" and put them in arrays, so they look like a loadout
      var finalItems = {};
      _.each(items, function(item, type) {
        var itemCopy = angular.copy(item);
        itemCopy.equipped = true;
        finalItems[type.toLowerCase()] = [ itemCopy ];
      });

      var loadout = {
        classType: -1,
        name: 'Maximize Light',
        items: finalItems
      };

      vm.applyLoadout(loadout, $event);
    };

    function applyLoadoutItems(items, loadout, _items, scope) {
      if (items.length > 0) {
        var pseudoItem = items.splice(0, 1)[0];
        var item = dimItemService.getItem(pseudoItem);

        if (item.type === 'Class') {
          item = _.findWhere(vm.store.items, {
            hash: pseudoItem.hash
          });
        }

        if (item) {
          var size = _.chain(vm.store.items)
            .filter(function(i) {
              return item.type === i.type;
            })
            .size()
            .value();

          var p = $q.when(item);

          var target;

          if (size === 10) {
            if (item.owner !== vm.store.id) {
              var moveItem = _items[item.type].splice(0, 1);
              p = $q.when(dimStoreService.getStores())
                .then(function(stores) {
                  return _.chain(stores)
                    // .filter(function(s) {
                    //   return (s.id !== 'vault');
                    // })
                    .sortBy(function(s) {
                      if (s.id === vm.store.id) {
                        return 0;
                      } else if (s.id === 'vault') {
                        return 2;
                      } else {
                        return 1;
                      }
                    })
                    .value();
                })
                .then(function(sortedStores) {
                  return _.find(sortedStores, function(s) {
                    return _.chain(s.items)
                      .filter(function(i) {
                        return item.type === i.type;
                      })
                      .size()
                      .value() < ((s.id === 'vault') ? 72 : 10);
                  });
                })
                .then(function(t) {
                  if (_.isUndefined(t)) {
                    throw new Error('Collector eh?  All your characters ' + moveItem[0].type.toLowerCase() + ' slots are full and I can\'t move items of characters, yet... Clear a slot on a character and I can complete the loadout.');
                  }
                  target = t;

                  return dimItemService.moveTo(moveItem[0], target);
                });
            }
          }

          var promise = p
            .then(function() {
              return dimItemService.moveTo(item, vm.store, pseudoItem.equipped);
            })
            .catch(function(a) {
              scope.failed = true;
              toaster.pop('error', item.name, a.message);
            })
            .finally(function() {
              applyLoadoutItems(items, loadout, _items, scope);
            });

          $rootScope.loadingTracker.addPromise(promise);
        }
      } else {
        var dimStores;

        $q.when(dimStoreService.getStores())
          .then(function(stores) {
            dimStores = stores;
            return dimStoreService.updateStores();
          })
          .then(function(bungieStores) {
            _.each(dimStores, function(dStore) {
              if (dStore.id !== 'vault') {
                var bStore = _.find(bungieStores, function(bStore) {
                  return dStore.id === bStore.id;
                });

                dStore.level = bStore.base.characterLevel;
                dStore.percentToNextLevel = bStore.base.percentToNextLevel;
                dStore.powerLevel = bStore.base.characterBase.powerLevel;
                dStore.background = bStore.base.backgroundPath;
                dStore.icon = bStore.base.emblemPath;
              }
            })
          })
          .then(function() {
            var value = 'success';
            var message = 'Your loadout has been transfered.';

            if (scope.failed) {
              value = 'warning';
              message = 'Your loadout has been transfered, with errors.'
            }

            toaster.pop(value, loadout.name, message);
          });
      }
    }
  }
})();
