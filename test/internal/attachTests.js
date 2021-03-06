(function (testFns) {
  var breeze = testFns.breeze;
  var core = breeze.core;

  var Enum = core.Enum;

  var MetadataStore = breeze.MetadataStore;
  var EntityManager = breeze.EntityManager;
  var EntityQuery = breeze.EntityQuery;
  var EntityKey = breeze.EntityKey;
  var EntityState = breeze.EntityState;


  var newEm = testFns.newEm;

  module("attach", {
    setup: function () {
      testFns.setup();
    },
    teardown: function () {

    }
  });


  test("setting another EntityState on a detached entity throws exception", 4,
      function () {
        var em = newEm(); // new empty EntityManager
        var order = em.createEntity('Order', { OrderID: 1 });

        var aspect = order.entityAspect;

        aspect.setDetached();
        ok(aspect.entityState.isDetached(),
            "'order' should be detached after setDetached()");

        try {
          aspect.setDeleted();
          fail('Deleted');
        } catch (e) {
          threwWhenSet(e, 'Deleted');
        }

        try {
          aspect.setModified();
          fail('Modified');
        } catch (e) {
          threwWhenSet(e, 'Modified');
        }

        try {
          aspect.setUnchanged();
          fail('Unchanged');
        } catch (e) {
          threwWhenSet(e, 'Unchanged');
        }

        // helpers
        function fail(method) {

          ok(false, "should not get here: " + method);
        }

        function threwWhenSet(error, method) {
          ok(error.message.indexOf("detached") >= 0, "Breeze error should have mentioned being detached when setting state to: " + method);
        }

      });

  test("infer unmapped boolean datatype", function () {

    var em = newEm(MetadataStore.importMetadata(testFns.metadataStore.exportMetadata()));
    var Customer = testFns.makeEntityCtor(function () {
      this.isBeingEdited = false;
    });
    em.metadataStore.registerEntityTypeCtor("Customer", Customer);

    var customerType = em.metadataStore.getEntityType("Customer");
    var unmapped = customerType.unmappedProperties[0];
    ok(unmapped.dataType == breeze.DataType.Boolean, "should be a boolean datatype");
  });

  test("boolean reject changes", function () {
    var em = newEm();
    var propName = testFns.DEBUG_MONGO ? "discontinued" : "isDiscontinued";
    var emp1 = em.createEntity("Product", null, EntityState.Detached);
    emp1.setProperty(propName, false);
    em.attachEntity(emp1);
    emp1.setProperty(propName, true);
    emp1.setProperty(propName, false);
    emp1.entityAspect.rejectChanges();
    var dc = emp1.getProperty(propName);
    ok(dc === false, "original value should be false");

  });

  test("detached entity retains its foreign keys", 9, function () {
    var em = newEm();
    var cust = em.createEntity("Customer", { companyName: "TestXXX" });
    var emp = em.createEntity("Employee", { firstName: "John", lastName: "Smith" });
    var order = em.createEntity('Order', {
      orderID: 1,
      customer: cust,
      employee: emp
    });

    // Pre-detach asserts
    equal(order.getProperty('customerID'), cust.getProperty('customerID'), "pre-detached order has CustomerID");
    equal(order.getProperty('employeeID'), emp.getProperty('employeeID'), "pre-detached order has EmployeeID");
    equal(order.getProperty('customer'), cust, "pre-detached order has a Customer");
    equal(order.getProperty('employee'), emp, "pre-detached order has an Employee");

    order.entityAspect.setDetached();

    // Post-detach asserts
    equal(order.getProperty('customerID'), cust.getProperty('customerID'), "post-detached order has CustomerID");
    equal(order.getProperty('employeeID'), emp.getProperty('employeeID'), "post-detached order has EmployeeID");
    equal(order.getProperty('customer'), null, "post-detached order no longer has a Customer");
    equal(order.getProperty('employee'), null, "post-detached order no longer has an Employee");
    deepEqual(order.entityAspect.originalValues, {}, "detaching does not add to 'originalValues'");
  });

  function createCustomer(em) {
    var custType = em.metadataStore.getEntityType("Customer");
    var cust = custType.createEntity();
    em.addEntity(cust);
    cust.setProperty("companyName", "TestXXX");
    return cust;
  }

  test("createEntity", function () {
    var em = newEm();
    var emp1 = em.createEntity("Employee");
    ok(emp1.entityAspect.entityState === EntityState.Added);

    var emp2 = em.createEntity("Employee", { firstName: "John", lastName: "Smith" });
    ok(emp2.entityAspect.entityState === EntityState.Added);

    var emp3 = em.createEntity("Employee", { firstName: "John", lastName: "Smith" }, EntityState.Detached);
    ok(emp3.entityAspect.entityState === EntityState.Detached);
    ok(emp3.getProperty("lastName") === "Smith");
  });

  test("store-managed int ID remains '0' after attachEntity", 2, function () {
    var em = newEm();
    var employeeType = em.metadataStore.getEntityType("Employee");
    var empIdProp = employeeType.getProperty(testFns.employeeKeyName);

    var defaultValue = testFns.DEBUG_MONGO ? "" : 0;
    var emp = employeeType.createEntity();
    ok(emp.getProperty(testFns.employeeKeyName) === defaultValue, "id should be zero at creation");
    var agkType = employeeType.autoGeneratedKeyType;
    // manager should NOT replace '0' with generated temp id
    em.attachEntity(emp);
    var id = emp.getProperty(testFns.employeeKeyName);
    ok(id === defaultValue,
            "id should still be its default value after attachEntity whose state is " +
            emp.entityAspect.entityState.name);
  });


  test("disallow setting collection navigation properties", function () {

    var em = newEm();
    var customerType = em.metadataStore.getEntityType("Customer");
    var customer = customerType.createEntity();
    var orderType = em.metadataStore.getEntityType("Order");
    var order = orderType.createEntity();
    em.attachEntity(customer);
    var origOrders = customer.getProperty("orders");
    ok(origOrders.length === 0);
    origOrders.push(order);
    ok(origOrders.length === 1);
    try {
      customer.setProperty("orders", ["foo", "bar"]);
      ok(false, "should not get here");
    } catch (e) {
      ok(e.message.indexOf("navigation") >= 0, "Exception should relate to navigation:" + e);
      ok(customer.getProperty("orders") == origOrders);
    }
  });

  test("cannot attach an entity created by a different metadataStore", 1, function () {
    var em = newEm();
    var customerType = em.metadataStore.getEntityType("Customer");
    var customer = customerType.createEntity();
    var newMs = MetadataStore.importMetadata(em.metadataStore.exportMetadata());
    var em2 = newEm(newMs);
    try {
      em2.attachEntity(customer);
      ok(false, "should not get here");
    } catch (e) {
      ok(e.message.indexOf("MetadataStore"));
    }

  });

  test("can attach a detached entity to a different manager via attach/detach", 2, function () {
    var em = newEm();
    var customerType = em.metadataStore.getEntityType("Customer");
    var customer = customerType.createEntity();
    var orderType = em.metadataStore.getEntityType("Order");
    var order = orderType.createEntity();
    em.attachEntity(customer);
    var orders = customer.getProperty("orders");
    ok(orders.length === 0);
    orders.push(order);
    var em2 = newEm();
    em.detachEntity(customer);
    em2.attachEntity(customer);
    ok(customer.entityAspect.entityManager === em2);
  });

  test("can attach a detached entity to a different manager via clear", 1, function () {
    var em1 = newEm();
    var cust = em1.metadataStore.getEntityType("Customer").createEntity();
    cust.setProperty(testFns.customerKeyName, core.getUuid());

    em1.attachEntity(cust);

    em1.clear(); // should detach cust
    ok(cust.entityAspect.entityState.isDetached,
        "cust should be detached");

    // therefore this should be ok
    var em2 = newEm();
    em2.attachEntity(cust); // D#2206 throws exception
  });


  test("setting child's parent entity null removes it from old parent", 2, function () {
    // D2183
    var em = newEm();
    var customerType = em.metadataStore.getEntityType("Customer");
    var customer = customerType.createEntity();
    em.attachEntity(customer);

    //var orderType = em.metadataStore.getEntityType("Order");
    //var newOrder = orderType.createEntity();
    //em.addEntity(newOrder);
    // newOrder.setProperty("customer", customer); // assign order to customer1
    var newOrder = em.createEntity("Order", { customer: customer });

    var orders = customer.getProperty("orders");
    ok(orders.indexOf(newOrder) >= 0,
        "newOrder is among the customer's orders");

    newOrder.setProperty("customer", null); // set null to decouple the order from a customer

    orders = customer.getProperty("orders");
    ok(orders.indexOf(newOrder) === -1,
        "newOrder is no longer among the customer's orders");

  });

  test("unidirectional attach - n->1", function () {
    if (testFns.DEBUG_MONGO) {
      ok(true, "NA for Mongo - OrderDetail");
      return;
    }

    var em = newEm();
    var orderDetailType = em.metadataStore.getEntityType("OrderDetail");
    var orderDetail = orderDetailType.createEntity();
    var productType = em.metadataStore.getEntityType("Product");
    var product = productType.createEntity();
    orderDetail.setProperty("productID", -99);
    em.attachEntity(orderDetail);
    em.attachEntity(product);
    var nullProduct = orderDetail.getProperty("product");
    ok(nullProduct === null);
    product.setProperty("productID", 7);
    orderDetail.setProperty("productID", 7);
    var sameProduct = orderDetail.getProperty("product");
    ok(product === sameProduct);

  });


  test("unidirectional attach - 1->n", function () {
    if (testFns.DEBUG_ODATA) {
      ok(true, "NA for OData - TimeList and Timegroup not yet added");
      return;
    }

    if (testFns.DEBUG_MONGO) {
      ok(true, "NA for Mongo - TimeList and Timegroup not yet added");
      return;
    }
    var em = newEm();

    var tl1 = em.createEntity("TimeLimit");
    var tl2 = em.createEntity("TimeLimit");
    var tg1 = em.createEntity("TimeGroup");
    var id = tg1.getProperty("id");
    tl1.setProperty("timeGroupId", id);
    var timeLimits = tg1.getProperty("timeLimits");
    ok(timeLimits.length === 1, "should be 1 timelimit");
    tl2.setProperty("timeGroupId", id);
    ok(timeLimits.length === 2, "should be 2 timelimit2");

  });

  test("unidirectional attach - 1->n - part 2", function () {
    if (testFns.DEBUG_MONGO) {
      ok(true, "NA for Mongo - TimeList and Timegroup not yet added");
      return;
    }

    if (testFns.DEBUG_ODATA) {
      ok(true, "NA for OData - TimeList and Timegroup not yet added");
      return;
    }

    var em = newEm();

    var tl1 = em.createEntity("TimeLimit");
    var tl2 = em.createEntity("TimeLimit");
    var tg1 = em.createEntity("TimeGroup");
    var timeLimits = tg1.getProperty("timeLimits");
    ok(timeLimits.length === 0, "should be 1 timelimit");
    timeLimits.push(tl1);
    ok(timeLimits.length === 1, "should be 1 timelimit");
    timeLimits.push(tl2);
    ok(timeLimits.length === 2, "should be 2 timelimit2");
    var timeLimits2 = tg1.getProperty("timeLimits");
    ok(timeLimits === timeLimits2);
    // add one that is already there
    timeLimits.push(tl1);
    ok(timeLimits.length === 2, "length should not change when adding a dup");

  });

  test("primary key fixup", function () {
    var em = newEm();
    var productType = em.metadataStore.getEntityType("Product");
    var product = productType.createEntity();
    em.attachEntity(product);
    var origProductId = product.getProperty(testFns.productKeyName);
    var entityKey = new EntityKey(productType, [origProductId]);
    var sameProduct = em.findEntityByKey(entityKey);
    var sameProduct2 = em.getEntityByKey("Product", origProductId);
    ok(product === sameProduct);
    ok(product === sameProduct2);
    product.setProperty(testFns.productKeyName, 7);
    sameProduct = em.getEntityByKey(entityKey);
    ok(sameProduct === null);
    entityKey = new EntityKey(productType, [7]);
    sameProduct = em.findEntityByKey(entityKey);
    ok(product === sameProduct);
  });

  function createProductCtor() {
    var init = function (entity) {
      ok(entity.entityType.shortName === "Product", "entity's productType should be 'Product'");
      ok(entity.getProperty("isObsolete") === false, "should not be obsolete");
      entity.setProperty("isObsolete", true);
    };
    return testFns.makeEntityCtor(function () {
      this.isObsolete = false;
      this.init = init;
    });

  };

  test("post create init 1", function () {
    var em = newEm(MetadataStore.importMetadata(testFns.metadataStore.exportMetadata()));
    var Product = createProductCtor();
    var productType = em.metadataStore.getEntityType("Product");
    em.metadataStore.registerEntityTypeCtor("Product", Product, function (entity) {
      ok(entity.entityType === productType, "entity's productType should be 'Product'");
      ok(entity.getProperty("isObsolete") === false, "should not be obsolete");
      entity.setProperty("isObsolete", true);
    });

    var product = productType.createEntity();
    ok(product.getProperty("isObsolete") === true);

    product.setProperty("isObsolete", false);
    ok(product.getProperty("isObsolete") === false);
  });

  test("post create init 2", function () {
    var em = newEm(MetadataStore.importMetadata(testFns.metadataStore.exportMetadata()));
    var Product = createProductCtor();

    var productType = em.metadataStore.getEntityType("Product");
    em.metadataStore.registerEntityTypeCtor("Product", Product, "init");

    var product = productType.createEntity();
    ok(product.getProperty("isObsolete") === true);
  });

  test("post create init 3", function () {
    var em = newEm(MetadataStore.importMetadata(testFns.metadataStore.exportMetadata()));
    var Product = createProductCtor();
    var productType = em.metadataStore.getEntityType("Product");
    em.metadataStore.registerEntityTypeCtor("Product", Product, "init");

    var product = productType.createEntity();
    ok(product.getProperty("isObsolete") === true);
  });

  test("post create init after new and attach", function () {
    var em = newEm(MetadataStore.importMetadata(testFns.metadataStore.exportMetadata()));
    var Product = createProductCtor();
    var product = new Product();
    var productType = em.metadataStore.getEntityType("Product");
    em.metadataStore.registerEntityTypeCtor("Product", Product, "init");
    em.attachEntity(product);

    ok(product.getProperty("isObsolete") === true);
  });

  test("changing FK to null removes it from old parent", 2, function () {
    // D2183
    var em = newEm();
    var customerType = em.metadataStore.getEntityType("Customer");
    var customer = customerType.createEntity();
    em.attachEntity(customer);

    //var orderType = em.metadataStore.getEntityType("Order");
    //var newOrder = orderType.createEntity();
    //em.addEntity(newOrder);
    // newOrder.setProperty("customer", customer); // assign order to customer1
    var newOrder = em.createEntity("Order", { customer: customer });

    ok(customer.getProperty("orders").indexOf(newOrder) >= 0,
        "newOrder is among customer's orders");

    newOrder.setProperty("customerID", null);
    ok(customer.getProperty("orders").indexOf(newOrder) === -1,
        "newOrder is no longer among customer's orders");
  });


  test("add, detach and readd", function () {
    // D2182
    var em = newEm();
    //var orderType = em.metadataStore.getEntityType("Order");
    //var newOrder = orderType.createEntity();
    //em.addEntity(newOrder);
    var newOrder = em.createEntity("Order");

    em.detachEntity(newOrder);
    em.addEntity(newOrder);// Exception thrown: "this key is already attached"
    ok(true);
  });


  test("attach, detach, reattach", function () {
    // D2182
    var em = newEm();
    var orderType = em.metadataStore.getEntityType("Order");
    var order = orderType.createEntity();
    em.attachEntity(order);

    em.detachEntity(order);
    em.attachEntity(order);// Exception thrown: "this key is already attached"
    ok(true);
  });


  test("exception if set nav to entity with different manager", function () {
    var em1 = newEm();
    var orderType = em1.metadataStore.getEntityType("Order");
    var o1 = orderType.createEntity();
    em1.attachEntity(o1);

    var em2 = newEm();
    var customerType = em2.metadataStore.getEntityType("Customer");
    var c1 = customerType.createEntity();
    em2.attachEntity(c1);

    ok(c1.entityAspect.entityManager !== o1.entityAspect.entityManager,
        "existingCustomer and existingOrder have different managers");

    try {
      o1.setProperty("customer", c1);
      ok(false, "shouldn't get here");
    } catch (e) {
      ok(e.message.indexOf("EntityManager") >= 0);
    }

  });


  test("attach across entityManagers", function () {
    var em1 = newEm();
    var custType = em1.metadataStore.getEntityType("Customer");
    var cust = custType.createEntity();
    em1.attachEntity(cust);
    var em2 = newEm();
    try {
      em2.attachEntity(cust);
      ok("fail", "should not be able to attach an entity to more than one entityManager");
    } catch (e) {
      ok(e.message.indexOf("EntityManager"));
    }
  });

  test("rejectChanges on added entity", function () {
    var em = newEm();
    //var typeInfo = em.metadataStore.getEntityType("Order");
    //var newEntity = typeInfo.createEntity();
    //em.addEntity(newEntity);
    var newEntity = em.createEntity("Order");

    var entityState = newEntity.entityAspect.entityState;
    ok(entityState.isAdded(),
            "newEntity should be in Added state; is " + entityState);

    newEntity.entityAspect.rejectChanges();

    entityState = newEntity.entityAspect.entityState;
    ok(entityState.isDetached(),
            "newEntity should be Detached after rejectChanges; is " + entityState);

    ok(!em.hasChanges(), "should not have changes");

    var inCache = em.getEntities(), count = inCache.length;
    ok(count == 0, "should have no entities in cache; have " + count);

  });

  test("delete added entity", 3, function () {
    var em = newEm();
    var typeInfo = em.metadataStore.getEntityType("Order");
    //var newEntity = typeInfo.createEntity();
    //em.addEntity(newEntity);
    var newEntity = em.createEntity(typeInfo);

    ok(newEntity.entityAspect.entityState.isAdded(),
        "new Todo added to cache is in 'added' state");

    newEntity.entityAspect.setDeleted();

    ok(newEntity.entityAspect.entityState.isDetached(),  // FAIL
        "new Todo added to cache is 'detached'");

    // get the first (and only) entity in cache
    equal(em.getEntities().length, 0, "no entities in cache"); //FAIL

  });


  test("add entity - no key", function () {
    if (testFns.DEBUG_MONGO) {
      ok(true, "NA for Mongo - OrderDetail");
      return;
    }
    var em = newEm();
    var odType = em.metadataStore.getEntityType("OrderDetail");
    var od = odType.createEntity();
    try {
      em.addEntity(od);
      ok(false, "should not be able to attach an entity without setting its key");
    } catch (e) {
      ok(e.message.indexOf("key") >= 0, "error message should contain 'key'");
    }
    try {
      var cId = em.generateTempKeyValue(od);
      ok(false, "should not be able to generate a temp multipart key");
    } catch (e) {
      ok(e.message.indexOf("multipart keys") >= 0, "error message should contain 'multipart keys'");
    }
    // only need to set part of the key
    od.setProperty("orderID", 999);
    em.addEntity(od);
  });

  test("add entity - no key 2", function () {
    if (testFns.DEBUG_MONGO) {
      ok(true, "NA for Mongo - OrderDetail");
      return;
    }
    var em = newEm();
    var od;
    try {
      od = em.createEntity("OrderDetail");
      ok(false, "should not be able to attach an entity without setting its key");
    } catch (e) {
      ok(e.message.indexOf("key") >= 0, "error message should contain 'key'");
    }
    try {
      od = em.createEntity("OrderDetail", null, EntityState.Detached);
      var cId = em.generateTempKeyValue(od);
      ok(false, "should not be able to generate a temp multipart key");
    } catch (e) {
      ok(e.message.indexOf("multipart keys") >= 0, "error message should contain 'multipart keys'");
    }
    // only need to set part of the key
    od.setProperty("orderID", 999);
    em.addEntity(od);
  });


  test("add child", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var orderType = em.metadataStore.getEntityType("Order");
    var cust1 = custType.createEntity();
    var order1 = orderType.createEntity();

    em.addEntity(cust1);
    ok(cust1.entityAspect.entityState === EntityState.Added, "cust entityState should be added");
    ok(cust1.entityAspect.hasTempKey === true, "hasTempKey should be true");
    var orders = cust1.getProperty("orders");

    var changeArgs = null;
    orders.arrayChanged.subscribe(function (args) {
      changeArgs = args;
    });
    orders.push(order1);
    ok(cust1.entityAspect.entityState === EntityState.Added, "cust entityState should be added");
    ok(order1.entityAspect.entityState === EntityState.Added, " order entityState should be added");
    ok(orders.parentEntity == cust1);
    var navProperty = cust1.entityType.getProperty("orders");
    ok(orders.navigationProperty == navProperty);
    ok(changeArgs.added, "changeArgs not set");
    ok(changeArgs.added[0] === order1, "changeArgs added property not set correctly");
    var sameCust = order1.getProperty("customer");
    ok(sameCust === cust1, "inverse relationship not setPropertiesd");

  });

  test("detach child", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var orderType = em.metadataStore.getEntityType("Order");
    var cust1 = custType.createEntity();
    var order1 = orderType.createEntity();
    var order2 = orderType.createEntity();

    em.addEntity(cust1);
    ok(cust1.entityAspect.entityState === EntityState.Added, "cust entityState should be added");
    var orders = cust1.getProperty("orders");
    orders.push(order1);
    orders.push(order2);
    var arrayChangeCount = 0;
    orders.arrayChanged.subscribe(function (args) {
      arrayChangeCount += 1;
      if (args.removed[0] !== order2) {
        ok(false, "should not have gotten here");
      }
    });
    var order2ChangeCount = 0;
    order2.entityAspect.propertyChanged.subscribe(function (args2) {
      ok(args2.entity === order2, "args2.entity === order2");
      if (args2.propertyName === "customer") {
        order2ChangeCount += 1;
      } else if (args2.propertyName === "customerID") {
        order2ChangeCount += 1;
      } else {
        ok(false, "should not have gotten here");
      }
    });
    var orders2 = cust1.getProperty("orders");
    ok(orders === orders2, "orders should === orders2");
    var ix = orders.indexOf(order2);
    orders.splice(ix, 1);
    ok(orders.length === 1, "should only be 1 order");
    ok(arrayChangeCount === 1, "arrayChangeCount should be 1");
    ok(order2ChangeCount === 2, "order2ChangeCount should be 2");

    var sameCust = order2.getProperty("customer");
    ok(sameCust === null, "order2.Customer should now be null");
  });

  test("add parent", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var orderType = em.metadataStore.getEntityType("Order");
    var cust1 = custType.createEntity();
    var order1 = orderType.createEntity();


    em.addEntity(order1);
    ok(order1.entityAspect.entityState.isAdded(), "order entityState should be added");
    var emptyCust = order1.getProperty("customer");
    ok(!emptyCust);
    var changeArgs = null;
    order1.entityAspect.propertyChanged.subscribe(function (args) {
      changeArgs = args;
    });
    order1.setProperty("customer", cust1);
    ok(order1.entityAspect.entityState.isAdded(), "order entityState should be added");
    ok(cust1.entityAspect.entityState.isAdded(), "customer entityState should be added");
    ok(changeArgs, "no property notification occured");
    ok(changeArgs.propertyName === "customer");
    ok(changeArgs.newValue === cust1, "changeArgs.newValue not set correctly");
    ok(changeArgs.oldValue === null, "changeArgs.oldValue not set correctly");
    var orders = cust1.getProperty("orders");
    ok(orders[0] == order1, "inverse relationship not setPropertiesd");

  });

  test("change parent (1-n)", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var orderType = em.metadataStore.getEntityType("Order");
    var cust1 = custType.createEntity();
    var cust2 = custType.createEntity();
    var order1 = orderType.createEntity();

    em.attachEntity(order1);
    ok(order1.entityAspect.entityState.isUnchanged(), "order1 should be 'unchanged'");
    order1.setProperty("customer", cust1);
    ok(cust1.entityAspect.entityState.isAdded(), "cust1 should be 'added'");
    var cust1Orders = cust1.getProperty("orders");
    ok(cust1Orders.length === 1, "There should be exactly one order in cust1Orders");
    ok(cust1Orders.indexOf(order1) >= 0, "order1 should be in cust1.Orders");

    // now change
    order1.setProperty("customer", cust2);
    ok(cust2.entityAspect.entityState.isAdded(), "cust2 should be added");
    var cust2Orders = cust2.getProperty("orders");
    ok(cust2Orders.length === 1, "There should be exactly one order in cust1Orders");
    ok(cust2Orders.indexOf(order1) >= 0, "order1 should be in cust2.Orders");
    ok(cust1Orders === cust1.getProperty("orders"), "cust1.Orders should be the same collection object as that returned earlier")
    ok(cust1Orders.indexOf(order1) == -1, "order1 should no longer be in cust1.Orders");
    ok(order1.getProperty("customer") == cust2, "order1.Customer should now be cust2");

  });

  test("change child (1-n)", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var orderType = em.metadataStore.getEntityType("Order");
    var cust1 = custType.createEntity();
    var cid1 = em.generateTempKeyValue(cust1);
    var cust2 = custType.createEntity();
    var cid2 = em.generateTempKeyValue(cust2);
    var order1 = orderType.createEntity();

    em.attachEntity(cust1);

    ok(cust1.entityAspect.entityState.isUnchanged(), "cust1 should be 'unchanged'");
    var cust1Orders = cust1.getProperty("orders");
    cust1Orders.push(order1);
    ok(cust1Orders.length === 1, "There should be exactly one order in cust1Orders");

    ok(order1.entityAspect.entityState.isAdded(), "order1 should be 'added'");
    ok(cust1Orders.indexOf(order1) >= 0, "order1 should be in cust1.Orders");
    // now change
    var cust2Orders = cust2.getProperty("orders");
    cust2Orders.push(order1);
    ok(cust2Orders.length === 1, "There should be exactly one order in cust2Orders");
    ok(cust1Orders.length === 0, "There should be no orders in cust1Orders")
    ok(cust2.entityAspect.entityState.isAdded(), "cust2 should be 'added'");
    ok(cust2Orders.indexOf(order1) >= 0, "order1 should be in cust2.Orders");
    ok(cust1Orders === cust1.getProperty("orders"), "cust1.Orders should be the same collection object as that returned earlier");
    ok(cust1Orders.indexOf(order1) == -1, "order1 should no longer be in cust1.Orders");
    ok(order1.getProperty("customer") == cust2, "order1.Customer should now be cust2");

  });

  test("graph attach (1-n) - setProperties child, attach child", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var orderType = em.metadataStore.getEntityType("Order");
    var cust1 = custType.createEntity();
    var order1 = orderType.createEntity();

    order1.setProperty("customer", cust1);
    em.attachEntity(order1);
    ok(order1.entityAspect.entityState === EntityState.Unchanged, "order entityState should be unchanged");
    ok(cust1.entityAspect.entityState === EntityState.Unchanged, "customer entityState should be unchanged");
    var orders = cust1.getProperty("orders");
    ok(orders[0] == order1, "inverse relationship not set");
    ok(orders[0].getProperty("customer") === cust1, "order.Customer not set");
  });

  test("graph attach (1-n)- setProperties child, attach parent", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var orderType = em.metadataStore.getEntityType("Order");
    var cust1 = custType.createEntity();
    var order1 = orderType.createEntity();

    order1.setProperty("customer", cust1);
    em.attachEntity(cust1);
    ok(order1.entityAspect.entityState === EntityState.Unchanged, "order entityState should be unchanged");
    ok(cust1.entityAspect.entityState === EntityState.Unchanged, "customer entityState should be unchanged");
    var orders = cust1.getProperty("orders");
    ok(orders[0] == order1, "inverse relationship not setProperties");
  });

  test("graph attach (1-n) - setProperties parent, attach parent", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var orderType = em.metadataStore.getEntityType("Order");
    var cust1 = custType.createEntity();
    var order1 = orderType.createEntity();

    var cust1Orders = cust1.getProperty("orders");
    cust1Orders.push(order1);
    ok(cust1Orders.length === 1, "There should be exactly one order in cust1Orders");
    em.attachEntity(cust1);
    ok(order1.entityAspect.entityState === EntityState.Unchanged, "order entityState should be unchanged");
    ok(cust1.entityAspect.entityState === EntityState.Unchanged, "customer entityState should be unchanged");
    ok(order1.getProperty("customer") === cust1, "inverse relationship not setPropertiesd");
  });

  test("graph attach (1-n) - setProperties parent, attach child", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var orderType = em.metadataStore.getEntityType("Order");
    var cust1 = custType.createEntity();
    var order1 = orderType.createEntity();

    var cust1Orders = cust1.getProperty("orders");
    cust1Orders.push(order1);
    ok(cust1Orders.length === 1, "There should be exactly one order in cust1Orders");
    em.attachEntity(order1);
    ok(order1.entityAspect.entityState === EntityState.Unchanged, "order entityState should be unchanged");
    ok(cust1.entityAspect.entityState === EntityState.Unchanged, "customer entityState should be unchanged");
    ok(order1.getProperty("customer") === cust1, "inverse relationship not setPropertiesd");
  });

  test("graph attach (1-n) - parent detach", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var orderType = em.metadataStore.getEntityType("Order");
    var cust1 = custType.createEntity();
    var order1 = orderType.createEntity();

    var cust1Orders = cust1.getProperty("orders");
    cust1Orders.push(order1);
    ok(cust1Orders.length === 1, "There should be exactly one order in cust1Orders");
    em.attachEntity(order1);
    ok(order1.entityAspect.entityState === EntityState.Unchanged, "order entityState should be unchanged");
    ok(cust1.entityAspect.entityState === EntityState.Unchanged, "customer entityState should be unchanged");
    ok(order1.getProperty("customer") === cust1, "inverse relationship not setProperties");
    var orderCustId = order1.getProperty(testFns.customerKeyName);
    em.detachEntity(cust1);
    ok(cust1.entityAspect.entityState.isDetached(), "should be detached");
    ok(order1.entityAspect.entityState.isUnchanged(), "should be unchanged");
    var orderCustId2 = order1.getProperty(testFns.customerKeyName);
    ok(orderCustId === orderCustId2, "custId should not have changed");


  });

  test("graph attach (1-n) - piecewise", function () {
    if (testFns.DEBUG_MONGO) {
      ok(true, "NA for Mongo - OrderDetail");
      return;
    }
    var em = newEm();
    var orderType = em.metadataStore.getEntityType("Order");
    var orderDetailType = em.metadataStore.getEntityType("OrderDetail");

    var order = orderType.createEntity();
    ok(order.entityAspect.entityState.isDetached(), "order should be 'detached");

    order.setProperty("orderID", 888);

    em.attachEntity(order);
    var orderId = order.getProperty("orderID");
    ok(orderId);
    ok(order.entityAspect.entityState.isUnchanged(), "order should be 'unchanged'");
    for (var i = 0; i < 3; i++) {
      var od = orderDetailType.createEntity();
      od.setProperty("productID", i + 1); // part of pk && not the default value
      order.getProperty("orderDetails").push(od);
      ok(od.entityAspect.entityState.isAdded(), "orderDetail should be 'added");
      ok(od.getProperty("order") === order, "orderDetail.order not set");
      ok(od.getProperty("orderID") === orderId, "orderDetail.orderId not set");
    }
  });

  // TODO: will not yet work if both order and orderDetail keys are autogenerated.
  test("graph attach (1-n)- all together", function () {
    if (testFns.DEBUG_MONGO) {
      ok(true, "NA for Mongo - OrderDetail");
      return;
    }
    var em = newEm();
    var orderType = em.metadataStore.getEntityType("Order");
    var orderDetailType = em.metadataStore.getEntityType("OrderDetail");

    var order = orderType.createEntity();
    ok(order.entityAspect.entityState.isDetached(), "order should be 'detached");
    order.setProperty("orderID", 999);

    for (var i = 0; i < 3; i++) {
      var od = orderDetailType.createEntity();
      od.setProperty("productID", i + 1); // part of pk and not the default value
      order.getProperty("orderDetails").push(od);
      ok(od.entityAspect.entityState.isDetached(), "orderDetail should be 'detached");
    }
    em.attachEntity(order);
    var orderId = order.getProperty("orderID");
    ok(orderId);
    ok(order.entityAspect.entityState.isUnchanged(), "order should be 'unchanged'");
    order.getProperty("orderDetails").forEach(function (od) {
      ok(od.getProperty("order") === order, "orderDetail.order not set");
      ok(od.getProperty("orderID") === orderId, "orderDetail.orderId not set");
      ok(od.entityAspect.entityState.isUnchanged(), "orderDetail should be 'unchanged");
    });
  });

  test("graph attach (1-n) - all together - autogenerated", function () {
    if (testFns.DEBUG_MONGO) {
      ok(true, "NA for Mongo - OrderDetail");
      return;
    }
    var em = newEm();
    var orderType = em.metadataStore.getEntityType("Order");
    var orderDetailType = em.metadataStore.getEntityType("OrderDetail");

    var order = orderType.createEntity();
    ok(order.entityAspect.entityState.isDetached(), "order should be 'detached");
    order.setProperty("orderID", 999);

    for (var i = 0; i < 3; i++) {
      var od = orderDetailType.createEntity();
      od.setProperty("productID", i); // part of pk
      order.getProperty("orderDetails").push(od);
      ok(od.entityAspect.entityState.isDetached(), "orderDetail should be 'detached");
    }
    em.attachEntity(order);
    ok(order.entityAspect.entityState.isUnchanged(), "order should be 'unchanged'");
    var orderId = order.getProperty("orderID");
    ok(orderId);
    order.getProperty("orderDetails").forEach(function (od) {
      ok(od.getProperty("order") === order, "orderDetail.order not set");
      ok(od.getProperty("orderID") === orderId, "orderDetail.orderId not set");
      ok(od.entityAspect.entityState.isUnchanged(), "orderDetail should be 'unchanged");
    });
  });


  test("duplicate entity keys", function () {
    var em = newEm();

    var cust1 = em.createEntity("Customer", null, EntityState.Detached);
    var cust2 = em.createEntity("Customer", null, EntityState.Detached);

    em.attachEntity(cust1);
    try {
      var cust1Id = cust1.getProperty(testFns.customerKeyName);
      cust2.setProperty(testFns.customerKeyName, cust1Id);
      em.attachEntity(cust2);
      ok(false, "should not be able to attach 2 entities with the same key");
    } catch (e) {
      ok(e.message.indexOf("key") >= 0);
    }

  });

  test("fk fixup - fk to nav - attached", function () {
    var em = newEm();

    var cust1 = em.createEntity("Customer", null, EntityState.Detached);
    var cust2 = em.createEntity("Customer", null, EntityState.Detached);
    var order1 = em.createEntity("Order", null, EntityState.Detached);

    em.attachEntity(order1);
    em.attachEntity(cust1);
    var custIdValue = cust1.getProperty(testFns.customerKeyName);
    order1.setProperty("customerID", custIdValue);
    var orderCustomer = order1.getProperty("customer");
    ok(orderCustomer === cust1, "nav property fixup did not occur");

  });

  test("fk fixup - nav to fk - attached", function () {
    var em = newEm();
    var cust1 = em.createEntity("Customer", null, EntityState.Detached);
    var cust2 = em.createEntity("Customer", null, EntityState.Detached);
    var orderType = em.metadataStore.getEntityType("Order");
    var order1 = em.createEntity(orderType, null, EntityState.Detached);

    em.attachEntity(order1);
    em.attachEntity(cust1);

    order1.setProperty("customer", cust1);
    var orderCustId = order1.getProperty("customerID");
    var custId = cust1.getProperty(testFns.customerKeyName);
    ok(orderCustId === custId, "fk property fixup did not occur");

  });

  test("fk fixup - unattached children", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var orderType = em.metadataStore.getEntityType("Order");
    var cust1 = custType.createEntity();
    var c1Id = em.generateTempKeyValue(cust1);
    var cust2 = custType.createEntity();
    var order1 = orderType.createEntity();
    em.attachEntity(order1);
    ok(order1.entityAspect.entityState.isUnchanged(), "order1 entityState should be 'unchanged'");
    // assign an fk where the parent doesn't yet exist on  this em.
    order1.setProperty("customerID", c1Id);
    ok(order1.entityAspect.entityState.isModified(), "order1 entityState should be 'modfied'");
    order1.entityAspect.acceptChanges();
    ok(order1.entityAspect.entityState.isUnchanged(), "order1 entityState should be 'unchanged'");
    var order1Cust = order1.getProperty("customer");
    ok(order1Cust == null, "order1.Customer should be null at this point.");
    em.attachEntity(cust1);
    order1Cust = order1.getProperty("customer");
    ok(order1Cust !== null, "order1.Customer should have been fixed up");
    ok(order1.entityAspect.entityState.isUnchanged(), "fixup should not change the entity state");
  });

  test("fk fixup - unattached parent pushes attached child", function () {
    var em = newEm();
    var custType = em.metadataStore.getEntityType("Customer");
    var orderType = em.metadataStore.getEntityType("Order");
    var cust1 = custType.createEntity();
    var c1Id = em.generateTempKeyValue(cust1);
    var cust2 = custType.createEntity();
    var order1 = orderType.createEntity();
    em.attachEntity(order1);
    ok(order1.entityAspect.entityState.isUnchanged(), "order1 entityState should be 'unchanged'");
    ok(cust1.entityAspect.entityState.isDetached(), "cust1 entityState should be 'detached'");
    var order1Cust = order1.getProperty("customer");
    ok(order1Cust == null, "order1.Customer should be null at this point.");
    var cust1Orders = cust1.getProperty("orders");
    cust1Orders.push(order1);
    ok(order1.entityAspect.entityState.isModified(), "order1 entityState should be 'modified'");
    ok(cust1.entityAspect.entityState.isAdded(), "order1 entityState should be 'added'");
    order1Cust = order1.getProperty("customer");
    ok(order1Cust !== null, "order1.Customer should have been fixed up");
    var order1CustId = order1.getProperty("customerID");
    var custId = cust1.getProperty(testFns.customerKeyName);
    ok(order1CustId === custId, "fk property fixup did not occur");

  });

  test("recursive navigation fixup", function () {
    var em = newEm();
    var empType = em.metadataStore.getEntityType("Employee");
    var emp1 = em.createEntity("Employee", null, EntityState.Detached);
    var emp2 = em.createEntity("Employee", null, EntityState.Detached);
    var emp3 = em.createEntity("Employee", null, EntityState.Detached);


    ok(emp1.entityAspect.entityState.isDetached(), "emp1 should be detached");
    ok(emp2.entityAspect.entityState.isDetached(), "emp2 should be detached");
    ok(emp3.entityAspect.entityState.isDetached(), "emp3 should be detached");
    emp2.setProperty("manager", emp1);
    emp2.getProperty("directReports").push(emp3);
    em.addEntity(emp3);
    ok(emp1.entityAspect.entityState.isAdded(), "emp1 should be unchanged");
    ok(emp2.entityAspect.entityState.isAdded(), "emp2 should be unchanged");
    ok(emp3.entityAspect.entityState.isAdded(), "emp3 should be unchanged");
    var emp1Id = emp1.getProperty(testFns.employeeKeyName);
    var emp2Id = emp2.getProperty(testFns.employeeKeyName);
    var emp3Id = emp3.getProperty(testFns.employeeKeyName);
    ok(emp2.getProperty("reportsToEmployeeID") === emp1Id, "emp2.ReportsTo... not set properly");
    ok(emp3.getProperty("reportsToEmployeeID") === emp2Id, "emp2.ReportsTo... not set properly");
    ok(emp2.getProperty("directReports")[0] === emp3, "emp2.DirectReports not set properly");
    ok(emp1.getProperty("directReports")[0] === emp2, "emp1.DirectReports not set properly");

  });

})(breezeTestFns);